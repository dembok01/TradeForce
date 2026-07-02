"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthActionState } from "@/lib/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <AuthShell
      eyebrow="Create account"
      title="Set up your charter."
      subtitle="Takes under a minute. No card required to start."
    >
      {state.success ? (
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-6">
          <p className="font-display text-lg text-foreground">Check your inbox.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We sent a confirmation link — follow it to activate your account.
          </p>
        </div>
      ) : (
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already enforcing discipline?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
