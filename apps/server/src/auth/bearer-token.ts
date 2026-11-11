import type { Request } from 'express';

/** The token from an `Authorization: Bearer <token>` header, if the request carries one. */
export function readBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : undefined;
}
