"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { updateSessionConfigAction, type RuleActionState } from "@/lib/actions/trading-rules";
import type { ActiveSession, TradingRules } from "@/lib/data/trading-plan";
import {
  SESSION_WINDOWS,
  formatWindowLocal,
  timezoneOptions,
  utcTimeToLocal,
  type SessionKey,
} from "@/lib/trading-sessions";
import { safeTimezone } from "@/lib/time-boundaries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";

const initialState: RuleActionState = { error: null };

const SESSION_TOGGLES: { name: keyof TradingRules; sessionKey: SessionKey; label: string }[] = [
  { name: "session_london_enabled", sessionKey: "london", label: "London" },
  { name: "session_new_york_enabled", sessionKey: "newYork", label: "New York" },
  { name: "session_asian_enabled", sessionKey: "asian", label: "Asian" },
  { name: "session_london_ny_overlap_enabled", sessionKey: "londonNyOverlap", label: "London / New York overlap" },
];

function InWindowTag() {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 [animation-duration:2.5s]" />
        <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
      </span>
      In window
    </span>
  );
}

export function SessionControlForm({
  rules,
  sessions = [],
}: {
  rules: TradingRules | null;
  sessions?: ActiveSession[];
}) {
  const [state, formAction, pending] = useActionState(updateSessionConfigAction, initialState);
  const errors = state.fieldErrors;
  const savedTz = safeTimezone(rules?.timezone);
  // Controlled so every window on the page re-labels the moment the zone changes.
  const [timezone, setTimezone] = useState(savedTz);
  const [customOn, setCustomOn] = useState(
    Boolean(rules?.custom_session_start && rules?.custom_session_end)
  );
  const tzOptions = useMemo(() => timezoneOptions(savedTz), [savedTz]);

  useEffect(() => {
    if (state.success) toast.success("Session settings saved.");
    if (state.error && !state.fieldErrors) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Timezone</CardTitle>
          <CardDescription>
            Your trading day, daily limits and every window on this page run on this clock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select name="timezone" value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {tzOptions.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allowed trading windows</CardTitle>
          <CardDescription>
            Turn on every window trading is permitted in — or leave them all off to allow trading anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SESSION_TOGGLES.map((toggle) => {
            const w = SESSION_WINDOWS[toggle.sessionKey];
            const inWindowNow = sessions.find((s) => s.key === toggle.sessionKey)?.active ?? false;
            return (
              <div key={toggle.name} className="flex items-center justify-between">
                <div>
                  <span className="flex items-center gap-2">
                    <Label htmlFor={toggle.name}>{toggle.label}</Label>
                    {inWindowNow && <InWindowTag />}
                  </span>
                  <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatWindowLocal(w.startUtc, w.endUtc, timezone)}
                  </p>
                </div>
                <Switch id={toggle.name} name={toggle.name} defaultChecked={Boolean(rules?.[toggle.name])} />
              </div>
            );
          })}

          <div className="border-t border-border/60 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="flex items-center gap-2">
                  <Label htmlFor="custom_window">Custom window</Label>
                  {customOn && sessions.find((s) => s.key === "custom")?.active && <InWindowTag />}
                </span>
                <p className="text-xs text-muted-foreground">Your own start and end time, on your clock.</p>
              </div>
              <Switch id="custom_window" checked={customOn} onCheckedChange={setCustomOn} />
            </div>

            {/* Switched off = the inputs unmount, submit nothing, and the window clears. */}
            {customOn && (
              <div className="mt-4 space-y-2">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="custom_session_start">Start time</Label>
                    <Input
                      id="custom_session_start"
                      name="custom_session_start"
                      type="time"
                      required
                      defaultValue={
                        rules?.custom_session_start ? utcTimeToLocal(rules.custom_session_start, savedTz) : ""
                      }
                      aria-invalid={Boolean(errors?.custom_session_end)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom_session_end">End time</Label>
                    <Input
                      id="custom_session_end"
                      name="custom_session_end"
                      type="time"
                      required
                      defaultValue={
                        rules?.custom_session_end ? utcTimeToLocal(rules.custom_session_end, savedTz) : ""
                      }
                      aria-invalid={Boolean(errors?.custom_session_end)}
                      aria-describedby={errors?.custom_session_end ? "custom_session_end-error" : undefined}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Times are in {timezone}. An end earlier than the start runs past midnight.
                </p>
                <FieldError id="custom_session_end-error" message={errors?.custom_session_end} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" variant="gold" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save sessions"}
      </Button>
    </form>
  );
}
