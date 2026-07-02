import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

// LoginForm reads useSearchParams (the post-login `next` target), so it must sit
// under a Suspense boundary to keep the page's static shell prerenderable.
function LoginFormFallback() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back."
      subtitle="Enter your credentials to reach your dashboard."
    >
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
