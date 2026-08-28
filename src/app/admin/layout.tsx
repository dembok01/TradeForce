import { redirect, notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/data/auth";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  // notFound() rather than a 403: an internal console shouldn't confirm its own
  // existence to a signed-in customer who guessed the URL.
  if (!(await isAdmin())) notFound();

  return <div className="min-h-screen bg-background p-4 md:p-8">{children}</div>;
}
