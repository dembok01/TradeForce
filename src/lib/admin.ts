import "server-only";
import { getAuthedUser } from "@/lib/data/auth";

/**
 * Internal ops access. An env allowlist rather than a role column: there are
 * one or two operators, the check has to be server-side regardless, and a
 * table would add a migration and a UI to manage two rows.
 *
 * ADMIN_EMAILS="a@x.com,b@y.com" — unset means nobody, which is the right
 * default if the variable is ever lost.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdmin(): Promise<boolean> {
  const user = await getAuthedUser();
  const email = user?.email?.toLowerCase();
  if (!email) return false;
  return adminEmails().includes(email);
}

/**
 * Throws unless the caller is an operator. Belongs next to a service-role read,
 * not only in the /admin layout.
 *
 * A layout is not a barrier its page waits behind: React Server Components
 * render a layout and its children concurrently, so a page's data fetching can
 * already be in flight while the layout is still deciding. Everywhere else in
 * this app authorization is RLS on a session-scoped client, which no mistake in
 * a guard can bypass. The ops console reads with the service role and therefore
 * has no such floor underneath it. This is that floor.
 *
 * It throws rather than calling notFound() so it stays usable from a data
 * module with no opinion about routing; the layout is what renders a 404 for a
 * signed-in customer who guessed the URL.
 */
export async function assertAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Forbidden: operator access required.");
}
