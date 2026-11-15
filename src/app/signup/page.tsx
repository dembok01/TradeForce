import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { Skeleton } from "@/components/ui/skeleton";

// SignupForm reads useSearchParams (where to go after signing up — the payment
// page by default, onboarding for the free route), so it sits under a Suspense
// boundary to keep the page's static shell prerenderable.
function SignupFormFallback() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow="Create account"
      title="Set up your charter."
      subtitle="A few details, then choose how long you want."
    >
      <Suspense fallback={<SignupFormFallback />}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
