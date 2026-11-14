import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHash,
  randomUUID,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// promisify(scrypt) resolves to the 3-arg overload; we need the options form.
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/*
 * Password hashing: scrypt via node:crypto (no native deps).
 * Format: "scrypt$N$r$p$saltHex$hashHex" — self-describing, so parameters can
 * be strengthened later without invalidating existing hashes.
 */

const N = 16384; // 2^14 — ~16 MiB memory per hash, comfortable for serverless
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = (await scryptAsync(password.normalize("NFKC"), salt, KEY_LEN, {
    N,
    r: R,
    p: P,
  })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scryptAsync(password.normalize("NFKC"), Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  })) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 256-bit opaque token, URL-safe. Raw value goes to the user; hash is stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Opaque tokens and reset tokens are stored only as SHA-256 digests. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newId(): string {
  return randomUUID();
}
