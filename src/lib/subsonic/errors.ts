/**
 * Subsonic error codes (https://www.subsonic.org/pages/api.jsp, OpenSubsonic).
 * Subsonic servers answer HTTP 200 even on failure, with `status: "failed"`.
 */
export const SubsonicErrorCode = {
  Generic: 0,
  MissingParameter: 10,
  ClientTooOld: 20,
  ServerTooOld: 30,
  WrongCredentials: 40,
  TokenAuthNotSupported: 41,
  AuthMechanismNotSupported: 42,
  ConflictingAuth: 43,
  InvalidApiKey: 44,
  NotAuthorized: 50,
  TrialExpired: 60,
  NotFound: 70,
} as const;

export type SubsonicErrorKind =
  /** The server answered with `status: "failed"`. */
  | 'api'
  /** The server answered with a non-2xx HTTP status. */
  | 'http'
  /** The server could not be reached (DNS, refused, timeout…). */
  | 'network'
  /** The server answered something that is not a valid Subsonic response. */
  | 'invalid-response';

/** HTTP status the app should return to its own callers for a given Subsonic error code. */
export function httpStatusForCode(code: number): number {
  switch (code) {
    case SubsonicErrorCode.MissingParameter:
      return 400;
    case SubsonicErrorCode.WrongCredentials:
    case SubsonicErrorCode.TokenAuthNotSupported:
    case SubsonicErrorCode.AuthMechanismNotSupported:
    case SubsonicErrorCode.ConflictingAuth:
    case SubsonicErrorCode.InvalidApiKey:
      return 401;
    case SubsonicErrorCode.NotAuthorized:
      return 403;
    case SubsonicErrorCode.NotFound:
      return 404;
    default:
      return 502;
  }
}

/**
 * Error raised by the Subsonic client. Messages never contain the request URL,
 * because it carries the reusable auth token.
 */
export class SubsonicError extends Error {
  readonly kind: SubsonicErrorKind;
  /** Subsonic error code, only for `kind: "api"`. */
  readonly code: number | undefined;
  /** Status to expose to the app's own HTTP callers. */
  readonly httpStatus: number;

  constructor(
    kind: SubsonicErrorKind,
    message: string,
    options: { code?: number; httpStatus?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'SubsonicError';
    this.kind = kind;
    this.code = options.code;
    this.httpStatus =
      options.httpStatus ??
      (kind === 'api' && options.code !== undefined ? httpStatusForCode(options.code) : 502);
  }
}
