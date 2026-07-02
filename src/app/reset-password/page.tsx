"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type AuthActionState } from "@/lib/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <AuthShell
      eyebrow="Reset password"
      title="Forgot your password?"
      subtitle="Enter the email on your account and we'll send a reset link."
    >
      {state.success ? (
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-6">
          <p className="font-display text-lg text-foreground">Check your inbox.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            If that email has an account, a reset link is on its way.
          </p>
        </div>
      ) : (
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
