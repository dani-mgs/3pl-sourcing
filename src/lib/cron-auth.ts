import { createHash, timingSafeEqual } from "node:crypto";

// Checks a cron request's `Authorization: Bearer <CRON_SECRET>` header (Vercel
// Cron sends it automatically when CRON_SECRET is set on the project). Every
// route under /api/cron/ must call this first: the middleware lets that prefix
// through without a signed-in user (see AGENTS.md).
//
// Fails closed: with no secret configured, nothing is authorized. Both sides
// are hashed first so the comparison is constant-time regardless of length.
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorizationHeader) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(authorizationHeader).digest();
  return timingSafeEqual(expected, received);
}
