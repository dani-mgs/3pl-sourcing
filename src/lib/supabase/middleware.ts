// Run on every request by src/proxy.ts (Next.js 16's replacement for
// middleware.ts): session refresh, the login redirect, routing client users
// into /portal (and everyone else out of it), and security headers.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { portalRoute } from "@/lib/auth/portal-routing";

const isDev = process.env.NODE_ENV === "development";

// Trailing slash included so "/api/cronjob" or "/api/cron" itself don't match.
export const CRON_ROUTE_PREFIX = "/api/cron/";

// Evidence-based, not a generic template — see docs/SECURITY.md and the CSP
// plan in the security-headers commit. script-src/style-src need
// 'unsafe-inline' because this app doesn't use nonce-based CSP (that would
// require forcing dynamic rendering on every page); style-src specifically
// needs it because @base-ui/react (the Select/dropdown primitives) sets
// inline `style` for popover positioning. connect-src only needs Supabase's
// own URL: Realtime and Storage aren't used anywhere in this app, and the AI
// extraction / PDF / DOCX export code only ever runs server-side.
function buildCspHeader(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self' ${supabaseUrl}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Content-Security-Policy", buildCspHeader());
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!isDev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return response;
}

// A refreshed session is written to supabaseResponse's cookies; a response
// built instead of it must carry them, or the user would be signed out.
function withSessionCookies(response: NextResponse, from: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Cron routes are called by Vercel Cron, never by a signed-in user, so they
  // skip the login redirect. Exactly this prefix and nothing else: every
  // route under it must verify CRON_SECRET itself (isAuthorizedCronRequest).
  const isCronRoute = request.nextUrl.pathname.startsWith(CRON_ROUTE_PREFIX);

  if (!user && request.nextUrl.pathname !== "/login" && !isCronRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  // Client users only reach /portal (a 404 anywhere else, Server Action POSTs
  // included); staff get a 404 for /portal. See src/lib/auth/portal-routing.ts.
  // app_metadata comes from getUser() above, i.e. live from Supabase Auth.
  if (user) {
    const decision = portalRoute(request.nextUrl.pathname, user.app_metadata);
    if (decision.kind === "redirect") {
      const url = request.nextUrl.clone();
      url.pathname = decision.to;
      url.search = "";
      return applySecurityHeaders(withSessionCookies(NextResponse.redirect(url), supabaseResponse));
    }
    if (decision.kind === "notFound") {
      return applySecurityHeaders(
        withSessionCookies(new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } }), supabaseResponse),
      );
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is
  // (headers are applied in place, not by replacing it).
  return applySecurityHeaders(supabaseResponse);
}
