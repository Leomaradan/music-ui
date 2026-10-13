import { createHash, randomBytes } from 'node:crypto';

export interface TokenAuth {
  /** md5(password + salt), hex */
  t: string;
  /** random salt */
  s: string;
}

/** Subsonic token auth (API >= 1.13): a fresh random salt for every request. */
export function createTokenAuth(
  password: string,
  salt = randomBytes(8).toString('hex'),
): TokenAuth {
  const t = createHash('md5')
    .update(password + salt, 'utf8')
    .digest('hex');
  return { t, s: salt };
}
