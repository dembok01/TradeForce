"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInAction, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  return (
    <>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/reset-password" className="text-xs text-muted-foreground hover:text-primary">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account yet?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Start enforcing discipline
        </Link>
      </p>
    </>
  );
}
