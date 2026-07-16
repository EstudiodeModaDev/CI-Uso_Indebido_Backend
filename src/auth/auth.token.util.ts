import type { Request } from "express";

export function extractBearerToken(request: Request,): string | null {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}