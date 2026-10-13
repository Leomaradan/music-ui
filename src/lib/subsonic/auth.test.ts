// @vitest-environment node
import { createTokenAuth } from './auth';

describe('createTokenAuth', () => {
  it('matches the example from the Subsonic API documentation', () => {
    expect(createTokenAuth('sesame', 'c19b2d')).toEqual({
      t: '26719a1196d2a940705a59634eb18eab',
      s: 'c19b2d',
    });
  });

  it('uses a fresh random salt each time', () => {
    const a = createTokenAuth('sesame');
    const b = createTokenAuth('sesame');
    expect(a.s).toMatch(/^[0-9a-f]{16}$/);
    expect(a.s).not.toBe(b.s);
    expect(a.t).not.toBe(b.t);
  });
});
