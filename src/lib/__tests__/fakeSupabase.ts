/**
 * An in-memory stand-in for the Supabase client, covering exactly the surface
 * src/lib/sync.ts uses: auth.getSession, select/upsert/update, the eq/gt/lt
 * filters, order, range and maybeSingle.
 *
 * The sync engine is the only code in the app that can lose a user's data
 * outright, and every interesting failure it has had — a watermark stepping
 * over rows a row cap truncated, two devices' drafts overwriting each other —
 * only shows up against a server that holds state across calls. A hand-rolled
 * fake is the cheapest way to get that: the real client cannot be pointed at
 * anything local, and vi.fn() stubs answer whatever the test already assumes.
 *
 * Not a test file itself (vitest collects `*.test.ts`), so it is imported by
 * the suites that mock "@/lib/supabase" with it.
 */

export type Row = Record<string, any>;

export interface SelectCall {
  table: string;
  from: number;
  to: number;
}

interface FakeState {
  session: { user: { id: string } } | null;
  /** Thrown by auth.getSession(), to exercise the sign-in failure path. */
  sessionError: Error | null;
  tables: Record<string, Row[]>;
  /** Every paged read this pass made, so tests can assert on pagination. */
  selectCalls: SelectCall[];
  /** Runs before a read resolves, so a test can simulate a local write
   *  landing while a sync pass is still in flight. */
  beforeSelect: ((table: string) => void | Promise<void>) | null;
  /** Makes `update` on one table fail, standing in for a column the
   *  project's schema does not have yet. */
  rejectUpdate: { table: string; error: { code?: string; message?: string } } | null;
}

export const TABLES = ["templates", "exercise_library", "workout_sessions", "active_workout_draft"];

export const fakeState: FakeState = {
  session: null,
  sessionError: null,
  tables: {},
  selectCalls: [],
  beforeSelect: null,
  rejectUpdate: null,
};

export function resetFakeSupabase(): void {
  fakeState.session = null;
  fakeState.sessionError = null;
  fakeState.tables = Object.fromEntries(TABLES.map((t) => [t, [] as Row[]]));
  fakeState.selectCalls = [];
  fakeState.beforeSelect = null;
  fakeState.rejectUpdate = null;
}

resetFakeSupabase();

/** Seeds a remote row, filling in the columns every table shares. */
export function remoteRow(table: string, row: Row): void {
  fakeState.tables[table].push({ deleted_at: null, ...row });
}

type Op = "eq" | "gt" | "lt";
interface Filter {
  op: Op;
  col: string;
  val: unknown;
}

/** ISO strings sort correctly as text, but only if both sides are ISO; fall
 *  back to raw comparison so a filter on any other column still works. */
function compare(a: unknown, b: unknown): number {
  const ta = typeof a === "string" ? Date.parse(a) : NaN;
  const tb = typeof b === "string" ? Date.parse(b) : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  return a === b ? 0 : (a as any) < (b as any) ? -1 : 1;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    if (f.op === "eq") return row[f.col] === f.val;
    const c = compare(row[f.col], f.val);
    return f.op === "gt" ? c > 0 : c < 0;
  });
}

class Builder implements PromiseLike<{ data: any; error: any }> {
  private filters: Filter[] = [];
  private orderCol: string | null = null;
  private ascending = true;
  private rangeFrom = 0;
  private rangeTo = Number.MAX_SAFE_INTEGER;
  private single = false;

  constructor(
    private table: string,
    private mode: "select" | "update",
    private patch?: Row
  ) {}

  eq(col: string, val: unknown): this {
    this.filters.push({ op: "eq", col, val });
    return this;
  }
  gt(col: string, val: unknown): this {
    this.filters.push({ op: "gt", col, val });
    return this;
  }
  lt(col: string, val: unknown): this {
    this.filters.push({ op: "lt", col, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.ascending = opts?.ascending !== false;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  maybeSingle(): this {
    this.single = true;
    return this;
  }

  private run(): { data: any; error: any } {
    const rows = fakeState.tables[this.table] ?? [];
    const hits = rows.filter((r) => matches(r, this.filters));

    if (this.mode === "update") {
      if (fakeState.rejectUpdate?.table === this.table) {
        return { data: null, error: fakeState.rejectUpdate.error };
      }
      for (const r of hits) Object.assign(r, this.patch);
      return { data: null, error: null };
    }

    if (this.orderCol) {
      const col = this.orderCol;
      hits.sort((a, b) => (this.ascending ? 1 : -1) * compare(a[col], b[col]));
    }
    const page = hits.slice(this.rangeFrom, this.rangeTo + 1).map((r) => ({ ...r }));
    if (this.rangeTo !== Number.MAX_SAFE_INTEGER) {
      fakeState.selectCalls.push({ table: this.table, from: this.rangeFrom, to: this.rangeTo });
    }
    if (this.single) return { data: page[0] ?? null, error: null };
    return { data: page, error: null };
  }

  then<R1 = { data: any; error: any }, R2 = never>(
    resolve?: ((v: { data: any; error: any }) => R1 | PromiseLike<R1>) | null,
    reject?: ((r: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => (this.mode === "select" ? fakeState.beforeSelect?.(this.table) : undefined))
      .then(() => this.run())
      .then(resolve, reject);
  }
}

/** The primary key each table upserts on, matching migration 007. */
function keyOf(table: string, row: Row): string {
  return table === "active_workout_draft" ? String(row.user_id) : `${row.user_id}:${row.id}`;
}

export const fakeSupabase = {
  auth: {
    async getSession() {
      if (fakeState.sessionError) throw fakeState.sessionError;
      return { data: { session: fakeState.session }, error: null };
    },
  },
  from(table: string) {
    return {
      select: (_cols?: string) => new Builder(table, "select"),
      update: (patch: Row) => new Builder(table, "update", patch),
      upsert: (input: Row | Row[]) => {
        const rows = Array.isArray(input) ? input : [input];
        const store = (fakeState.tables[table] ??= []);
        for (const row of rows) {
          const key = keyOf(table, row);
          const at = store.findIndex((r) => keyOf(table, r) === key);
          const merged = { deleted_at: null, ...row };
          if (at === -1) store.push(merged);
          else store[at] = { ...store[at], ...merged };
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
  },
};
