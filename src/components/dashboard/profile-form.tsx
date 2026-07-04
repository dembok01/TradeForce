"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { updateProfileAction, type ProfileActionState } from "@/lib/actions/profile";
import { EXPERIENCE_LEVELS, MARKET_OPTIONS } from "@/lib/schemas/onboarding";
import type { Profile } from "@/lib/data/profile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const initialState: ProfileActionState = { error: null };

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);
  const [markets, setMarkets] = useState<Set<string>>(new Set(profile.markets_traded ?? []));
  const errors = state.fieldErrors;

  useEffect(() => {
    if (state.success) toast.success("Profile saved.");
    if (state.error && !state.fieldErrors) toast.error(state.error);
  }, [state]);

  function toggleMarket(value: string) {
    setMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            The details from your onboarding — shown on your dashboard, editable here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile.full_name ?? ""}
                placeholder="Your name"
                aria-invalid={Boolean(errors?.full_name)}
                aria-describedby={errors?.full_name ? "full_name-error" : undefined}
              />
              <FieldError id="full_name-error" message={errors?.full_name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop_firm">Prop firm</Label>
              <Input
                id="prop_firm"
                name="prop_firm"
                defaultValue={profile.prop_firm ?? ""}
                placeholder="e.g. FTMO"
                aria-invalid={Boolean(errors?.prop_firm)}
                aria-describedby={errors?.prop_firm ? "prop_firm-error" : undefined}
              />
              <FieldError id="prop_firm-error" message={errors?.prop_firm} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="experience_level">Where you are</Label>
            <Select name="experience_level" defaultValue={profile.experience_level ?? undefined}>
              <SelectTrigger id="experience_level" className="max-w-xs">
                <SelectValue placeholder="Select your stage" />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="experience_level-error" message={errors?.experience_level} />
          </div>

          <div className="space-y-2">
            <Label>Markets you trade</Label>
            <div className="flex flex-wrap gap-2">
              {MARKET_OPTIONS.map((market) => {
                const checked = markets.has(market.value);
                return (
                  <label
                    key={market.value}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors",
                      checked
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    <input
                      type="checkbox"
                      name="markets_traded"
                      value={market.value}
                      checked={checked}
                      onChange={() => toggleMarket(market.value)}
                      className="sr-only"
                    />
                    {market.label}
                  </label>
                );
              })}
            </div>
            <FieldError id="markets_traded-error" message={errors?.markets_traded} />
          </div>

          <Button type="submit" variant="gold" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
