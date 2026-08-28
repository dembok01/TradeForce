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
