import { Injectable } from '@nestjs/common';
import { isDefined, isEmpty } from '@warehouser/utils/predicates';
import {
  namesCookie,
  statesCookieValue,
} from 'auth/domain/predicates/session-cookie.predicates';

export const AUTH_SESSION_COOKIE = 'warehouser_session';

export interface AuthCookieResponse {
  cookie(
    name: string,
    value: string,
    options: Readonly<Record<string, unknown>>,
  ): void;
}

const decodeCookieValue = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

export const readSessionCookie = (
  cookieHeader: string | undefined,
): string | undefined => {
  if (!isDefined(cookieHeader) || isEmpty(cookieHeader)) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (!statesCookieValue(separator)) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (namesCookie(name, AUTH_SESSION_COOKIE)) {
      return decodeCookieValue(part.slice(separator + 1).trim());
    }
  }

  return undefined;
};

@Injectable()
export class AuthCookie {
  constructor(private readonly secure: boolean) {}

  issue(response: AuthCookieResponse, secret: string, expiresAt: Date): void {
    response.cookie(AUTH_SESSION_COOKIE, secret, {
      expires: expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.secure,
    });
  }

  expire(response: AuthCookieResponse): void {
    response.cookie(AUTH_SESSION_COOKIE, '', {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: this.secure,
    });
  }
}
