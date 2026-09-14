// The Web Push crypto, checked against an independent implementation rather
// than against itself. http_ece is the aes128gcm library the Node ecosystem's
// web-push is built on, so decrypting our ciphertext with it is the same test
// a browser's push service performs — the part that otherwise could only be
// verified by deploying and standing in a gym waiting for a buzz.
import crypto from "node:crypto";
import ece from "http_ece";
import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  buildVapidToken,
  encryptPayload,
} from "./webpush";

/** A browser's end of a push subscription: an ECDH key pair plus a secret. */
function makeSubscription() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  return {
    ecdh,
    authSecret,
    p256dh: bytesToBase64Url(new Uint8Array(ecdh.getPublicKey())),
    auth: bytesToBase64Url(new Uint8Array(authSecret)),
  };
}

function decryptAsBrowser(body: Uint8Array, sub: ReturnType<typeof makeSubscription>): string {
  return ece
    .decrypt(Buffer.from(body), {
      version: "aes128gcm",
      privateKey: sub.ecdh,
      authSecret: sub.authSecret.toString("base64url"),
    })
    .toString("utf8");
}

const VAPID = {
  // Generated below in the one test that needs a real key pair; these two are
  // filled in there rather than hardcoded.
  subject: "mailto:peak@example.com",
};

function makeVapidKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    ...VAPID,
    publicKey: bytesToBase64Url(new Uint8Array(ecdh.getPublicKey())),
    privateKey: bytesToBase64Url(new Uint8Array(ecdh.getPrivateKey())),
  };
}

describe("encryptPayload", () => {
  it("produces something the receiving device can actually decrypt", async () => {
    const sub = makeSubscription();
    const body = await encryptPayload("Rest complete — Barbell Bench Press", sub);

    expect(decryptAsBrowser(body, sub)).toBe("Rest complete — Barbell Bench Press");
  });

  it("lays the header out as RFC 8188 requires", async () => {
    const sub = makeSubscription();
    const body = await encryptPayload("hi", sub);

    // salt(16) | record size(4) | key id length(1) | server public key(65)
    expect(body.length).toBeGreaterThan(86);
    expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096);
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(0x04); // uncompressed P-256 point
  });

  it("uses a fresh salt and server key for every message", async () => {
    // Reusing either across messages to the same device would leak, and is
    // the kind of thing that only shows up when someone looks.
    const sub = makeSubscription();
    const a = await encryptPayload("same text", sub);
    const b = await encryptPayload("same text", sub);

    expect(bytesToBase64Url(a.slice(0, 16))).not.toBe(bytesToBase64Url(b.slice(0, 16)));
    expect(bytesToBase64Url(a.slice(21, 86))).not.toBe(bytesToBase64Url(b.slice(21, 86)));
  });

  it("round-trips text the app actually sends, accents and all", async () => {
    const sub = makeSubscription();
    const text = "Rest over — 4×5 @ 82.5kg — Incline Dumbbell Press";
    const body = await encryptPayload(text, sub);

    expect(decryptAsBrowser(body, sub)).toBe(text);
  });

  it("is not decryptable with a different device's key", async () => {
    const intended = makeSubscription();
    const other = makeSubscription();
    const body = await encryptPayload("secret", intended);

    expect(() => decryptAsBrowser(body, other)).toThrow();
  });
});

describe("buildVapidToken", () => {
  it("signs a JWT the push service can verify with the public key", async () => {
    const vapid = makeVapidKeys();
    const token = await buildVapidToken("https://push.example.com", vapid);
    const [header, claims, signature] = token.split(".");

    const pub = base64UrlToBytes(vapid.publicKey);
    const key = await crypto.subtle.importKey(
      "raw",
      pub,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(`${header}.${claims}`)
    );

    expect(verified).toBe(true);
  });

  it("claims the audience, subject and an expiry the spec allows", async () => {
    const vapid = makeVapidKeys();
    const token = await buildVapidToken("https://fcm.googleapis.com", vapid);
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8")
    );

    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("mailto:peak@example.com");
    // RFC 8292 caps exp at 24 hours out; push services reject anything longer.
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    expect(claims.exp).toBeLessThanOrEqual(Date.now() / 1000 + 24 * 60 * 60);
  });

  it("declares ES256, which is the only algorithm VAPID allows", async () => {
    const vapid = makeVapidKeys();
    const token = await buildVapidToken("https://push.example.com", vapid);
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));

    expect(header).toEqual({ typ: "JWT", alg: "ES256" });
  });

  it("rejects a malformed public key rather than signing something unusable", async () => {
    await expect(
      buildVapidToken("https://push.example.com", {
        ...VAPID,
        publicKey: bytesToBase64Url(new Uint8Array(32)),
        privateKey: bytesToBase64Url(new Uint8Array(32)),
      })
    ).rejects.toThrow(/65-byte/);
  });
});

describe("base64url", () => {
  it("round-trips arbitrary bytes without padding or URL-unsafe characters", () => {
    const bytes = crypto.randomBytes(200);
    const encoded = bytesToBase64Url(new Uint8Array(bytes));

    expect(encoded).not.toMatch(/[+/=]/);
    expect(Buffer.from(base64UrlToBytes(encoded)).equals(bytes)).toBe(true);
  });
});
