"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { updateSessionConfigAction, type RuleActionState } from "@/lib/actions/trading-rules";
import type { ActiveSession, TradingRules } from "@/lib/data/trading-plan";
import { TIMEZONE_OPTIONS } from "@/lib/trading-sessions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";

const initialState: RuleActionState = { error: null };

const SESSION_TOGGLES: { name: string; sessionKey: string; label: string; hint: string }[] = [
  { name: "session_london_enabled", sessionKey: "london", label: "London", hint: "08:00–16:30 UTC" },
  { name: "session_new_york_enabled", sessionKey: "newYork", label: "New York", hint: "13:00–22:00 UTC" },
  { name: "session_asian_enabled", sessionKey: "asian", label: "Asian", hint: "00:00–09:00 UTC" },
  {
    name: "session_london_ny_overlap_enabled",
    sessionKey: "londonNyOverlap",
    label: "London / New York overlap",
    hint: "13:00–16:30 UTC",
  },
];

export function SessionControlForm({
  rules,
  sessions = [],
}: {
  rules: TradingRules | null;
  sessions?: ActiveSession[];
}) {
  const [state, formAction, pending] = useActionState(updateSessionConfigAction, initialState);
  const errors = state.fieldErrors;

  useEffect(() => {
    if (state.success) toast.success("Session settings saved.");
    if (state.error && !state.fieldErrors) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Allowed sessions</CardTitle>
          <CardDescription>Toggle on any windows trading is permitted in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SESSION_TOGGLES.map((toggle) => {
            const defaultChecked = Boolean(
              rules?.[toggle.name as keyof TradingRules] as boolean | undefined
            );
            const inWindowNow = sessions.find((s) => s.key === toggle.sessionKey)?.active ?? false;
            return (
              <div key={toggle.name} className="flex items-center justify-between">
                <div>
                  <span className="flex items-center gap-2">
                    <Label htmlFor={toggle.name}>{toggle.label}</Label>
                    {inWindowNow && (
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
                        <span className="relative flex size-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 [animation-duration:2.5s]" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                        </span>
                        In window
                      </span>
                    )}
                  </span>
                  <p className="text-xs text-muted-foreground">{toggle.hint}</p>
                </div>
                <Switch id={toggle.name} name={toggle.name} defaultChecked={defaultChecked} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom trading window</CardTitle>
          <CardDescription>Optional — set a specific start/end time in your timezone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="custom_session_start">Start time</Label>
              <Input
                id="custom_session_start"
                name="custom_session_start"
                type="time"
                defaultValue={rules?.custom_session_start ?? ""}
                aria-invalid={Boolean(errors?.custom_session_end)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom_session_end">End time</Label>
              <Input
                id="custom_session_end"
                name="custom_session_end"
                type="time"
                defaultValue={rules?.custom_session_end ?? ""}
                aria-invalid={Boolean(errors?.custom_session_end)}
                aria-describedby={errors?.custom_session_end ? "custom_session_end-error" : undefined}
              />
            </div>
          </div>
          <FieldError id="custom_session_end-error" message={errors?.custom_session_end} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timezone</CardTitle>
        </CardHeader>
        <CardContent>
          <Select name="timezone" defaultValue={rules?.timezone ?? "UTC"}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Button type="submit" variant="gold" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save & activate"}
      </Button>
    </form>
  );
}
