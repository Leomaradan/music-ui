// Password hashing shared by the server (src/lib/auth) and the user CLI (scripts/cli.mjs).
// Plain JavaScript with Node built-ins only: the CLI runs as-is inside the Docker image.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

// 128 * N * r = 16 MiB of memory per hash, under Node's 32 MiB default limit.
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

/** Usernames: letters, digits and `_ . @ -`, 1 to 64 characters. */
export const USERNAME_PATTERN = /^[\w.@-]{1,64}$/;

/** Hashes a password as `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

/** Checks a password against a stored hash. A malformed hash never matches. */
export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every(Number.isSafeInteger)) return false;
  const expected = Buffer.from(hash, 'base64url');
  if (expected.length === 0) return false;
  try {
    const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, params);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
