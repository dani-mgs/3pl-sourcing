import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // IMPORTANT: You *must* return the supabaseResponse object as it is
  // (headers are applied in place, not by replacing it).
  return applySecurityHeaders(supabaseResponse);
}
