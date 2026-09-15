import { AUTH_SESSION_COOKIE, readSessionCookie } from 'auth/rest/auth-cookie';
import { describe, expect, it } from 'vitest';

// `auth-rest.spec.ts` exercises this module only through the controller, which sends a cookie
// header it built itself — so the parser is never shown a header a browser or a proxy actually
// produced. The parser is the first thing an unauthenticated request touches, and every exit it has
// decides whether a request is treated as signed in, so each one is pinned here rather than left to
// whatever shape the controller spec happens to pass.
describe('readSessionCookie', () => {
  it('reads the session secret out of a header carrying several cookies', () => {
    expect(
      readSessionCookie(
        `locale=en; ${AUTH_SESSION_COOKIE}=opaque-secret; theme=dark`,
      ),
    ).toBe('opaque-secret');
  });

  it('tolerates the whitespace a cookie header is written with', () => {
    expect(readSessionCookie(`  ${AUTH_SESSION_COOKIE} = spaced  `)).toBe(
      'spaced',
    );
  });

  // The value is percent-encoded on the way out, so it is decoded on the way back in — otherwise a
  // secret containing a reserved character would not round-trip.
  it('percent-decodes the value', () => {
    expect(readSessionCookie(`${AUTH_SESSION_COOKIE}=a%2Fb%20c`)).toBe('a/b c');
  });

  // A malformed escape makes `decodeURIComponent` throw. That must read as "no session", not as an
  // exception escaping into the guard: this runs before any error handling a route would have, and
  // the header is entirely attacker-controlled.
  it('treats an undecodable value as no session rather than throwing', () => {
    expect(
      readSessionCookie(`${AUTH_SESSION_COOKIE}=%E0%A4%A`),
    ).toBeUndefined();
  });

  // A segment with no `=` at all — which a header ending in a stray `;` produces, and which some
  // proxies emit — is skipped rather than treated as a nameless cookie.
  it('skips a segment carrying no separator and keeps scanning', () => {
    expect(
      readSessionCookie(
        `flagged; ${AUTH_SESSION_COOKIE}=after-a-bare-segment;`,
      ),
    ).toBe('after-a-bare-segment');
  });

  it('returns nothing when the header names no session cookie', () => {
    expect(readSessionCookie('locale=en; theme=dark')).toBeUndefined();
  });

  // A name that merely contains the cookie's name must not match it.
  it('does not match a cookie whose name only resembles the session cookie', () => {
    expect(
      readSessionCookie(`x_${AUTH_SESSION_COOKIE}=impostor`),
    ).toBeUndefined();
  });

  it.each([[undefined], ['']])(
    'returns nothing when there is no header at all: %p',
    (header) => {
      expect(readSessionCookie(header)).toBeUndefined();
    },
  );
});
