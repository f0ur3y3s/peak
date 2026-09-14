/**
 * Web Push (RFC 8291 payload encryption, RFC 8292 VAPID) on nothing but
 * WebCrypto.
 *
 * Deliberately dependency-free and free of any Deno-specific API: the same
 * file runs in the Edge Function and under the repo's Node test runner, so
 * the crypto is covered by tests rather than trusted because it deployed.
 * The npm ecosystem's web-push is a Node library that reaches for `https`
 * and `crypto`; rather than find out at runtime how much of that the Edge
 * runtime polyfills, this uses only what both have natively.
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  /** The device's public key, base64url, as the browser hands it over. */
  p256dh: string;
  /** The device's auth secret, base64url. */
  auth: string;
}

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url (65 bytes). */
  publicKey: string;
  /** Raw private scalar, base64url (32 bytes). */
  privateKey: string;
  /** "mailto:" or "https:" contact, per RFC 8292. */
  subject: string;
}

const enc = new TextEncoder();

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** HKDF-SHA256 in one call: extract with `salt`, expand with `info`. */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    bytes * 8
  );
  return new Uint8Array(bits);
}

/** A VAPID private key is distributed as a raw scalar; WebCrypto wants JWK. */
async function importVapidPrivateKey(vapid: VapidKeys): Promise<CryptoKey> {
  const pub = base64UrlToBytes(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  }
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: vapid.privateKey,
      x: bytesToBase64Url(pub.slice(1, 33)),
      y: bytesToBase64Url(pub.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

/**
 * The `Authorization: vapid t=…, k=…` token proving to the push service that
 * this really is the application server the subscription was created for.
 * ES256 over {aud, exp, sub}; the signature is raw r||s, which is what JWS
 * wants and what WebCrypto already produces.
 */
export async function buildVapidToken(
  audience: string,
  vapid: VapidKeys,
  expiresInSeconds = 12 * 60 * 60
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    sub: vapid.subject,
  };
  const signingInput = `${bytesToBase64Url(enc.encode(JSON.stringify(header)))}.${bytesToBase64Url(
    enc.encode(JSON.stringify(claims))
  )}`;
  const key = await importVapidPrivateKey(vapid);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput) as BufferSource
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/** Test seam: fixing the salt and server keypair makes the output reproducible. */
export interface EncryptOverrides {
  salt?: Uint8Array;
  serverKeyPair?: CryptoKeyPair;
}

/**
 * Encrypts one record in the aes128gcm content coding (RFC 8188), keyed per
 * RFC 8291, producing the exact bytes that go in the POST body:
 *
 *   salt(16) | record size(4) | key id length(1) | server public key(65) | ciphertext
 */
export async function encryptPayload(
  plaintext: string,
  subscription: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  overrides: EncryptOverrides = {}
): Promise<Uint8Array> {
  const uaPublicBytes = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);

  const serverKeys =
    overrides.serverKeyPair ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const serverPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeys.publicKey)
  );

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicBytes as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, serverKeys.privateKey, 256)
  );

  // RFC 8291 §3.4: the auth secret salts the first derivation, and the two
  // public keys are bound into its info so a key pair can only ever decrypt
  // messages addressed to it.
  const keyInfo = concat(
    enc.encode("WebPush: info\0"),
    uaPublicBytes,
    serverPublicBytes
  );
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // 0x02 is the padding delimiter marking this as the last record. One
  // record is enough: these payloads are a line of text.
  const record = concat(enc.encode(plaintext), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      record as BufferSource
    )
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([serverPublicBytes.length]), serverPublicBytes, ciphertext);
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** 404/410 mean the subscription is dead and should be forgotten. */
  gone: boolean;
}

export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: string,
  vapid: VapidKeys,
  ttlSeconds = 120
): Promise<PushResult> {
  const audience = new URL(subscription.endpoint).origin;
  const [token, body] = await Promise.all([
    buildVapidToken(audience, vapid),
    encryptPayload(payload, subscription),
  ]);

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      // A rest alert is worthless once the rest is over, so it is better for
      // the push service to drop it than to hold it.
      TTL: String(ttlSeconds),
      Urgency: "high",
    },
    body: body as BodyInit,
  });

  return {
    ok: response.ok,
    status: response.status,
    gone: response.status === 404 || response.status === 410,
  };
}
