"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUpAction, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";

const initialState: AuthActionState = { error: null };

/**
 * Everything the manual payment process needs, collected once.
 *
 * The phone number is not decoration: payments here are matched by hand, and
 * when a transaction reference does not match what arrived in the bank, a
 * phone call is the only way the operator can resolve it without guessing.
 *
 * The terms checkbox is required by the schema rather than by the browser's
 * `required` attribute alone, because a form can be posted without one.
 */
export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  const searchParams = useSearchParams();
  // Default decided by the action, not here, so a form posted without the
  // field still lands on the payment page.
  const next = searchParams.get("next") ?? "";
  const errors = state.fieldErrors;

  if (state.success) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-6">
        <p className="font-display text-lg text-foreground">Check your inbox.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a confirmation link — follow it to activate your account and pick your plan.
        </p>
      </div>
    );
  }

  return (
    <>
      <form action={formAction} className="space-y-5">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            autoFocus
            aria-invalid={Boolean(errors?.fullName)}
            aria-describedby={errors?.fullName ? "fullName-error" : undefined}
          />
          <FieldError id="fullName-error" message={errors?.fullName} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            aria-invalid={Boolean(errors?.phone)}
            aria-describedby={errors?.phone ? "phone-error" : "phone-hint"}
          />
          {errors?.phone ? (
            <FieldError id="phone-error" message={errors.phone} />
          ) : (
            <p id="phone-hint" className="text-xs text-muted-foreground">
              With the country code. We use it only if there&apos;s a question about your payment.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={Boolean(errors?.email)}
            aria-describedby={errors?.email ? "email-error" : "email-hint"}
          />
          {errors?.email ? (
            <FieldError id="email-error" message={errors.email} />
          ) : (
            <p id="email-hint" className="text-xs text-muted-foreground">
              Payment confirmations and your access details go here.
            </p>
          )}
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
            aria-invalid={Boolean(errors?.password)}
            aria-describedby={errors?.password ? "password-error" : "password-hint"}
          />
          {errors?.password ? (
            <FieldError id="password-error" message={errors.password} />
          ) : (
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={Boolean(errors?.confirmPassword)}
            aria-describedby={errors?.confirmPassword ? "confirmPassword-error" : undefined}
          />
          <FieldError id="confirmPassword-error" message={errors?.confirmPassword} />
        </div>

        <div className="space-y-1.5 border-t border-border/60 pt-5">
          <div className="flex items-start gap-3">
            {/* Native checkbox: it is the only kind that arrives in FormData
                without a hidden-input shim, and the server has to see it. */}
            <input
              id="terms"
              name="terms"
              type="checkbox"
              required
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-primary"
              aria-invalid={Boolean(errors?.terms)}
              aria-describedby={errors?.terms ? "terms-error" : undefined}
            />
            <label htmlFor="terms" className="cursor-pointer text-xs leading-relaxed text-muted-foreground">
              I have read and accept the{" "}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener"
                className="text-primary underline underline-offset-2"
              >
                Terms of Service
              </Link>
              . I understand TradeForce is a discipline tool, that rule enforcement is best effort
              and can fail, that every trade and loss on my account is mine, and that payments are
              non-refundable.
            </label>
          </div>
          <FieldError id="terms-error" message={errors?.terms} />
        </div>

        {state.error && !errors && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already enforcing discipline?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
