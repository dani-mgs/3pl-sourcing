import { userRole } from "./roles";

// Where a signed-in user may go (the proxy applies this on every request).
// Client users live in /portal and get a 404 everywhere else; while their
// first-login flag is set they only reach the change-password page. Staff
// (and accounts without a role) get a 404 for /portal until "View as
// client" exists. This is the first layer only: every staff Server Action
// and the staff layout check the role again, and every portal page and
// action checks for a client user.

export const PORTAL_PATH = "/portal";
export const CHANGE_PASSWORD_PATH = "/portal/change-password";

export type PortalDecision = { kind: "next" } | { kind: "redirect"; to: string } | { kind: "notFound" };

export function isPortalPath(pathname: string): boolean {
  return pathname === PORTAL_PATH || pathname.startsWith(`${PORTAL_PATH}/`);
}

export function portalRoute(pathname: string, appMetadata: Record<string, unknown> | null | undefined): PortalDecision {
  const inPortal = isPortalPath(pathname);

  if (userRole(appMetadata) !== "client") {
    return inPortal ? { kind: "notFound" } : { kind: "next" };
  }

  // The landing pages send a client user home.
  const isLanding = pathname === "/" || pathname === "/login";

  if (appMetadata?.must_change_password === true) {
    if (pathname === CHANGE_PASSWORD_PATH) return { kind: "next" };
    return inPortal || isLanding ? { kind: "redirect", to: CHANGE_PASSWORD_PATH } : { kind: "notFound" };
  }

  if (inPortal) return { kind: "next" };
  return isLanding ? { kind: "redirect", to: PORTAL_PATH } : { kind: "notFound" };
}
