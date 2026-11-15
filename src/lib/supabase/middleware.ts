import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Paths a signed-out visitor may reach.
 *
 * /terms is here because the signup checkbox links to it: the one person who
 * most needs to read the terms is the one who has not got an account yet.
 *
 * /pay is here although it needs a session, because the page itself sends a
 * signed-out visitor to /signup — which is the flow the client asked for, buy
 * then sign up then pay. Letting the middleware send them to /login instead
 * would show a brand-new customer a password prompt for an account they do
 * not have.
 */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/reset-password",
  "/update-password",
  "/auth",
  "/terms",
  "/pay",
];

/** Exported so the list can be tested without standing up a request. */
export function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/api/ea/")) return true; // Bearer-auth'd separately, not session-based
  if (pathname.startsWith("/api/cron/")) return true; // CRON_SECRET-auth'd, not session-based
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not remove: this call refreshes the auth token and must run before any
  // other logic touches the session, or the refreshed cookies are lost.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
