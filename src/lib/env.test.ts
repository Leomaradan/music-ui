// @vitest-environment node
import { EnvError, parseEnv } from './env';

const valid = {
  SUBSONIC_URL: 'http://navidrome:4533',
  SUBSONIC_USER: 'music',
  SUBSONIC_PASSWORD: 'secret-password',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv(valid)).toEqual({
      ...valid,
      SUBSONIC_CLIENT_NAME: 'music-ui',
      SUBSONIC_TIMEOUT_MS: 15_000,
      SYNC_INTERVAL_MINUTES: 15,
      DATA_DIR: './data',
      LOG_LEVEL: 'info',
      AUTH_ENABLED: true,
      SESSION_DAYS: 30,
    });
  });

  it('parses AUTH_ENABLED as a boolean', () => {
    expect(parseEnv({ ...valid, AUTH_ENABLED: 'false' }).AUTH_ENABLED).toBe(false);
    expect(parseEnv({ ...valid, AUTH_ENABLED: '1' }).AUTH_ENABLED).toBe(true);
    expect(() => parseEnv({ ...valid, AUTH_ENABLED: 'maybe' })).toThrow(/AUTH_ENABLED/);
  });

  it('coerces numbers', () => {
    const env = parseEnv({ ...valid, SYNC_INTERVAL_MINUTES: '0', SUBSONIC_TIMEOUT_MS: '5000' });
    expect(env.SYNC_INTERVAL_MINUTES).toBe(0);
    expect(env.SUBSONIC_TIMEOUT_MS).toBe(5000);
  });

  it('treats empty strings as missing', () => {
    expect(() => parseEnv({ ...valid, SUBSONIC_PASSWORD: '' })).toThrow(/SUBSONIC_PASSWORD/);
    expect(parseEnv({ ...valid, DATA_DIR: '' }).DATA_DIR).toBe('./data');
  });

  it('lists every invalid variable without leaking values', () => {
    let error: unknown;
    try {
      parseEnv({
        SUBSONIC_URL: 'ftp://nas',
        SUBSONIC_PASSWORD: 'secret-password',
        LOG_LEVEL: 'loud',
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvError);
    const { issues, message } = error as EnvError;
    expect(issues.map((issue) => issue.split(':')[0])).toEqual([
      'SUBSONIC_URL',
      'SUBSONIC_USER',
      'LOG_LEVEL',
    ]);
    expect(message).not.toContain('secret-password');
  });
});
