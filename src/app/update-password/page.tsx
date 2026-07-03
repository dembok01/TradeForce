"use client";

import { useActionState } from "react";
import { updatePasswordAction, type AuthActionState } from "@/lib/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";

const initialState: AuthActionState = { error: null };

export default function UpdatePasswordPage() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialState);
  const errors = state.fieldErrors;

  return (
    <AuthShell
      eyebrow="New password"
      title="Set a new password."
      subtitle="Choose something you haven't used before."
    >
      <form action={formAction} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
            aria-invalid={Boolean(errors?.password)}
            aria-describedby={errors?.password ? "password-error" : undefined}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          <FieldError id="password-error" message={errors?.password} />
        </div>
        {state.error && !errors && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
