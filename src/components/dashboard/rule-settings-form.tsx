"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { updateRuleSettingsAction, type RuleActionState } from "@/lib/actions/trading-rules";
import type { TradingRules } from "@/lib/data/trading-plan";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { cn } from "@/lib/utils";

const initialState: RuleActionState = { error: null };

export function RuleSettingsForm({ rules }: { rules: TradingRules | null }) {
  const [state, formAction, pending] = useActionState(updateRuleSettingsAction, initialState);
  const [active, setActive] = useState(rules?.is_active ?? false);
  const errors = state.fieldErrors;

  useEffect(() => {
    if (state.success) toast.success("Rules saved and activated.");
    if (state.error && !state.fieldErrors) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Risk limits</CardTitle>
          <CardDescription>The numbers TradeForce enforces against every trade.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="daily_loss_limit">Daily loss limit ($)</Label>
            <Input
              id="daily_loss_limit"
              name="daily_loss_limit"
              type="number"
              step="any"
              min="0"
              defaultValue={rules?.daily_loss_limit ?? ""}
              placeholder="e.g. 500"
              aria-invalid={Boolean(errors?.daily_loss_limit)}
              aria-describedby={errors?.daily_loss_limit ? "daily_loss_limit-error" : undefined}
            />
            <FieldError id="daily_loss_limit-error" message={errors?.daily_loss_limit} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_trades_per_day">Max trades per day</Label>
            <Input
              id="max_trades_per_day"
              name="max_trades_per_day"
              type="number"
              min="0"
              defaultValue={rules?.max_trades_per_day ?? ""}
              placeholder="e.g. 5"
              aria-invalid={Boolean(errors?.max_trades_per_day)}
              aria-describedby={errors?.max_trades_per_day ? "max_trades_per_day-error" : undefined}
            />
            <FieldError id="max_trades_per_day-error" message={errors?.max_trades_per_day} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_open_positions">Max open positions</Label>
            <Input
              id="max_open_positions"
              name="max_open_positions"
              type="number"
              min="0"
              defaultValue={rules?.max_open_positions ?? ""}
              placeholder="e.g. 2"
              aria-invalid={Boolean(errors?.max_open_positions)}
              aria-describedby={errors?.max_open_positions ? "max_open_positions-error" : undefined}
            />
            <FieldError id="max_open_positions-error" message={errors?.max_open_positions} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="risk_per_trade_percent">Risk per trade (% of balance)</Label>
            <Input
              id="risk_per_trade_percent"
              name="risk_per_trade_percent"
              type="number"
              step="any"
              min="0"
              max="100"
              defaultValue={rules?.risk_per_trade_percent ?? ""}
              placeholder="e.g. 1"
              aria-invalid={Boolean(errors?.risk_per_trade_percent)}
              aria-describedby={errors?.risk_per_trade_percent ? "risk_per_trade_percent-error" : undefined}
            />
            <FieldError id="risk_per_trade_percent-error" message={errors?.risk_per_trade_percent} />
          </div>
        </CardContent>
      </Card>

      {/* The one gold moment on this page: the card glows while the charter is live. */}
      <Card
        className={cn(
          "transition-[box-shadow,border-color] duration-500",
          active && "border-gold-glow border-primary/30"
        )}
      >
        <CardHeader>
          <CardTitle>Activation</CardTitle>
          <CardDescription>
            Turn enforcement on once your limits are set. Session windows live on the Sessions page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Charter active</Label>
            <Switch id="is_active" name="is_active" checked={active} onCheckedChange={setActive} />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" variant="gold" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save & activate"}
      </Button>
    </form>
  );
}
