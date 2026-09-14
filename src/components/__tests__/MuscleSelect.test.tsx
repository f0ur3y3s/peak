// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MuscleSelect } from "@/components/MuscleSelect";

beforeAll(() => {
  // jsdom has no layout, so neither of these exists.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function Harness({ onChange }: { onChange?: (v: string) => void } = {}) {
  const [value, setValue] = useState("");
  return (
    <MuscleSelect
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const input = () => screen.getByRole("combobox");

describe("MuscleSelect", () => {
  it("announces itself as a combobox that is closed until used", () => {
    render(<Harness />);
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens a listbox of options on focus", () => {
    render(<Harness />);
    fireEvent.focus(input());

    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("walks the options with the arrow keys, keeping focus in the field", () => {
    // The whole point of aria-activedescendant: previously the only way into
    // the options was to Tab out of the input and through them one by one.
    render(<Harness />);
    fireEvent.focus(input());

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    const first = screen.getAllByRole("option")[0];
    expect(input().getAttribute("aria-activedescendant")).toBe(first.id);
    expect(first.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[1].id
    );
  });

  it("enters the list at the bottom when arrowing up, and wraps", () => {
    render(<Harness />);
    fireEvent.focus(input());
    const options = screen.getAllByRole("option");

    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().getAttribute("aria-activedescendant")).toBe(options[options.length - 1].id);

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe(options[0].id);
  });

  it("picks the highlighted option with Enter", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    const chosen = screen.getAllByRole("option")[0].textContent;

    fireEvent.keyDown(input(), { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(chosen);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("leaves Enter alone when nothing is highlighted", () => {
    // Otherwise opening the field and pressing Enter to submit the form would
    // silently pick whatever happened to be first.
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(input());

    fireEvent.keyDown(input(), { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  it("closes on Escape without letting it reach the dialog outside", () => {
    // This field lives inside a Modal that closes on Escape; dismissing the
    // suggestions must not throw away the form behind them.
    const onOuterEscape = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === "Escape" && onOuterEscape()}>
        <Harness />
      </div>
    );
    fireEvent.focus(input());

    fireEvent.keyDown(input(), { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onOuterEscape).not.toHaveBeenCalled();
  });

  it("lets Escape through once there is nothing to dismiss", () => {
    const onOuterEscape = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === "Escape" && onOuterEscape()}>
        <Harness />
      </div>
    );

    fireEvent.keyDown(input(), { key: "Escape" });

    expect(onOuterEscape).toHaveBeenCalled();
  });

  it("narrows the options as you type and drops the stale highlight", () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBeTruthy();

    fireEvent.change(input(), { target: { value: "tri" } });

    expect(input().getAttribute("aria-activedescendant")).toBeNull();
    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels).toContain("Triceps");
    expect(labels).not.toContain("Quads");
  });

  it("still selects on click", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(input());
    const option = screen.getAllByRole("option")[2];
    const label = option.textContent;

    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(label);
  });

  it("gives every option a distinct id even where two groups share a name", () => {
    render(<Harness />);
    fireEvent.focus(input());
    const ids = screen.getAllByRole("option").map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
