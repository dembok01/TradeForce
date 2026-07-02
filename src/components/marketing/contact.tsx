"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitEnquiryAction, type ContactActionState } from "@/lib/actions/contact";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ContactActionState = { error: null };

export function Contact() {
  const [state, formAction, pending] = useActionState(submitEnquiryAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <section id="contact" className="border-t border-border/60 bg-obsidian py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2 lg:gap-20">
        <div>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
            Enquiries
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Running a prop firm? Managing a cohort of traders?
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            Tell us what you&apos;re trying to enforce and how many accounts are involved.
            We reply within one business day.
          </p>
        </div>

        <form ref={formRef} action={formAction} className="space-y-5">
          {state.success ? (
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-6">
              <p className="font-display text-lg text-foreground">Message sent.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ll get back to you shortly.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required autoComplete="name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" name="message" required rows={5} />
              </div>
              {state.error && (
                <p role="alert" className="text-sm text-destructive">
                  {state.error}
                </p>
              )}
              <Button type="submit" variant="gold" size="lg" disabled={pending}>
                {pending ? "Sending…" : "Send message"}
              </Button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
