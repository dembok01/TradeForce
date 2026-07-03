"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { completeOnboardingAction } from "@/lib/actions/onboarding";
import {
  EXPERIENCE_LEVELS,
  MARKET_OPTIONS,
  ONBOARDING_STEP_SCHEMAS,
} from "@/lib/schemas/onboarding";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/schemas/form";
import { TIMEZONE_OPTIONS } from "@/lib/trading-sessions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/ui/field-error";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "about", label: "About you" },
  { key: "risk", label: "Risk limits" },
  { key: "pace", label: "Trading pace" },
  { key: "sessions", label: "Session windows" },
  { key: "review", label: "Review & sign" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const SESSION_TOGGLES = [
  { name: "session_london_enabled", label: "London", hint: "08:00–16:30 UTC" },
  { name: "session_new_york_enabled", label: "New York", hint: "13:00–22:00 UTC" },
  { name: "session_asian_enabled", label: "Asian", hint: "00:00–09:00 UTC" },
  { name: "session_london_ny_overlap_enabled", label: "London / New York overlap", hint: "13:00–16:30 UTC" },
] as const;

type WizardValues = {
  full_name: string;
  experience_level: string;
  markets_traded: string[];
  prop_firm: string;
  daily_loss_limit: string;
  risk_per_trade_percent: string;
  max_trades_per_day: string;
  max_open_positions: string;
  session_london_enabled: boolean;
  session_new_york_enabled: boolean;
  session_asian_enabled: boolean;
  session_london_ny_overlap_enabled: boolean;
  timezone: string;
};

// Which wizard step owns each schema field, for jumping back to the right
// step if the server-side re-validation ever disagrees with the client.
const FIELD_STEP: Record<string, number> = {};
(["about", "risk", "pace", "sessions"] as const).forEach((key, i) => {
  for (const field of Object.keys(ONBOARDING_STEP_SCHEMAS[key].shape)) {
    FIELD_STEP[field] = i;
  }
});

export function OnboardingWizard({ defaultFullName = "" }: { defaultFullName?: string }) {
  const [values, setValues] = useState<WizardValues>({
    full_name: defaultFullName,
    experience_level: "",
    markets_traded: [],
    prop_firm: "",
    daily_loss_limit: "",
    risk_per_trade_percent: "",
    max_trades_per_day: "",
    max_open_positions: "",
    session_london_enabled: false,
    session_new_york_enabled: false,
    session_asian_enabled: false,
    session_london_ny_overlap_enabled: false,
    timezone: "UTC",
  });
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [signing, setSigning] = useState(false);
  const [pending, startTransition] = useTransition();
  const reduceMotion = useReducedMotion();

  // Default the timezone to the browser's, when it's one we offer. Done in an
  // effect (not the initializer) so server and client first paints match.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIMEZONE_OPTIONS.some((o) => o.value === tz)) {
      setValues((v) => ({ ...v, timezone: tz }));
    }
  }, []);

  function set<K extends keyof WizardValues>(key: K, value: WizardValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function handleBack() {
    if (step === 0 || signing || pending) return;
    setFieldErrors({});
    setDirection(-1);
    setStep((s) => s - 1);
  }

  function handleContinue() {
    const key = STEPS[step].key as Exclude<StepKey, "review">;
    const parsed = ONBOARDING_STEP_SCHEMAS[key].safeParse(values);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setFieldErrors({});
    setDirection(1);
    setStep((s) => s + 1);
  }

  function submit() {
    startTransition(async () => {
      // On success the action redirects to the dashboard — only errors return.
      const result = await completeOnboardingAction(values);
      if (result?.error) {
        setSigning(false);
        toast.error(result.error);
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
          const target = Object.keys(result.fieldErrors)
            .map((f) => FIELD_STEP[f])
            .filter((s) => s !== undefined)
            .sort((a, b) => a - b)[0];
          if (target !== undefined) {
            setDirection(-1);
            setStep(target);
          }
        }
      }
    });
  }

  // The signing ceremony: stamp the provisions in sequence, then submit.
  function handleSign() {
    if (signing || pending) return;
    if (reduceMotion) {
      submit();
      return;
    }
    setSigning(true);
    window.setTimeout(submit, provisions.length * 180 + 450);
  }

  const enabledSessions = SESSION_TOGGLES.filter((t) => values[t.name]).map((t) => t.label);
  const provisions = [
    {
      label: "Daily loss limit",
      value: values.daily_loss_limit ? `$${values.daily_loss_limit}` : "—",
    },
    {
      label: "Risk per trade",
      value: values.risk_per_trade_percent ? `${values.risk_per_trade_percent}%` : "—",
    },
    {
      label: "Max trades per day",
      value: values.max_trades_per_day || "—",
    },
    {
      label: "Max open positions",
      value: values.max_open_positions || "No cap",
    },
    {
      label: "Session windows",
      value: enabledSessions.length > 0 ? enabledSessions.join(", ") : "Any time",
    },
  ];

  const isReview = STEPS[step].key === "review";

  return (
    <div className="w-full max-w-4xl">
      <div className="grid overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[280px_1fr]">
        {/* Progress ledger — the charter takes shape as steps complete. */}
        <aside className="hidden flex-col justify-between border-r border-border/60 bg-sidebar p-8 lg:flex">
          <div>
            <Link href="/" className="font-display text-lg font-semibold tracking-tight">
              Trade<span className="text-gradient-gold">Force</span>
            </Link>
            <p className="mb-2 mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Charter drafting
            </p>
            <ol>
              {STEPS.map((s, i) => {
                const done = i < step;
                const current = i === step;
                return (
                  <li key={s.key} className="ledger-row flex items-center gap-3 py-3">
                    <span
                      className={cn(
                        "font-mono text-[11px]",
                        current ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-sm transition-colors duration-300",
                        current ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {s.label}
                    </span>
                    <motion.span
                      initial={false}
                      animate={{ opacity: done ? 1 : 0, scale: done ? 1 : 0.6 }}
                      transition={{ duration: 0.25 }}
                      className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary"
                    >
                      <Check className="size-2.5" strokeWidth={3} />
                    </motion.span>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
            Your answers become the charter TradeForce enforces — you can amend
            any of it later from Rule Settings.
          </p>
        </aside>

        <div className="flex min-h-[560px] flex-col p-6 sm:p-8">
          {/* Mobile progress row */}
          <div className="mb-6 lg:hidden">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-base font-semibold tracking-tight">
                Trade<span className="text-gradient-gold">Force</span>
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                Step {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="relative mb-8 h-0.5 w-full overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              initial={false}
              animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>

          <div className="flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: direction >= 0 ? 24 : -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction >= 0 ? -24 : 24 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {STEPS[step].key === "about" && (
                  <StepShell
                    eyebrow="Step one"
                    title="First, about you"
                    description="So the charter reads like yours, not a template's."
                  >
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Name</Label>
                        <Input
                          id="full_name"
                          value={values.full_name}
                          onChange={(e) => set("full_name", e.target.value)}
                          placeholder="How should we address you?"
                          autoFocus
                        />
                        <FieldError id="full_name-error" message={fieldErrors.full_name} />
                      </div>

                      <div className="space-y-2">
                        <Label>Where are you in the prop-firm journey?</Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {EXPERIENCE_LEVELS.map((option) => {
                            const selected = values.experience_level === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => set("experience_level", option.value)}
                                className={cn(
                                  "rounded-lg border p-4 text-left transition-colors",
                                  selected
                                    ? "border-primary/50 bg-primary/5"
                                    : "border-border hover:border-primary/25"
                                )}
                              >
                                <p className="text-sm font-medium">{option.label}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
                              </button>
                            );
                          })}
                        </div>
                        <FieldError
                          id="experience_level-error"
                          message={fieldErrors.experience_level && "Choose the option that fits you."}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Which markets do you trade?</Label>
                        <div className="flex flex-wrap gap-2">
                          {MARKET_OPTIONS.map((market) => {
                            const on = values.markets_traded.includes(market.value);
                            return (
                              <button
                                key={market.value}
                                type="button"
                                aria-pressed={on}
                                onClick={() =>
                                  set(
                                    "markets_traded",
                                    on
                                      ? values.markets_traded.filter((m) => m !== market.value)
                                      : [...values.markets_traded, market.value]
                                  )
                                }
                                className={cn(
                                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                                  on
                                    ? "border-primary/50 bg-primary/10 text-foreground"
                                    : "border-border text-muted-foreground hover:border-primary/25"
                                )}
                              >
                                {market.label}
                              </button>
                            );
                          })}
                        </div>
                        <FieldError
                          id="markets_traded-error"
                          message={fieldErrors.markets_traded && "Pick at least one market."}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="prop_firm">
                          Prop firm <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id="prop_firm"
                          value={values.prop_firm}
                          onChange={(e) => set("prop_firm", e.target.value)}
                          placeholder="e.g. FTMO, Topstep"
                        />
                      </div>
                    </div>
                  </StepShell>
                )}

                {STEPS[step].key === "risk" && (
                  <StepShell
                    eyebrow="Step two"
                    title="The line you won't cross"
                    description="These two numbers do the most protecting. TradeForce holds them for you on the days discipline is hardest."
                  >
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="daily_loss_limit">Daily loss limit ($)</Label>
                        <Input
                          id="daily_loss_limit"
                          type="number"
                          step="any"
                          min="0"
                          value={values.daily_loss_limit}
                          onChange={(e) => set("daily_loss_limit", e.target.value)}
                          placeholder="e.g. 500"
                          autoFocus
                          aria-invalid={Boolean(fieldErrors.daily_loss_limit)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Most prop firms breach an account at 5% of balance — set yours tighter.
                        </p>
                        <FieldError id="daily_loss_limit-error" message={fieldErrors.daily_loss_limit} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="risk_per_trade_percent">Risk per trade (% of balance)</Label>
                        <Input
                          id="risk_per_trade_percent"
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          value={values.risk_per_trade_percent}
                          onChange={(e) => set("risk_per_trade_percent", e.target.value)}
                          placeholder="e.g. 1"
                          aria-invalid={Boolean(fieldErrors.risk_per_trade_percent)}
                        />
                        <p className="text-xs text-muted-foreground">
                          1% is the funded-trader convention; more than 2% rarely survives a losing streak.
                        </p>
                        <FieldError
                          id="risk_per_trade_percent-error"
                          message={fieldErrors.risk_per_trade_percent}
                        />
                      </div>
                    </div>
                  </StepShell>
                )}

                {STEPS[step].key === "pace" && (
                  <StepShell
                    eyebrow="Step three"
                    title="Your trading pace"
                    description="Overtrading breaks more evaluations than bad analysis does. Cap it before it happens."
                  >
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="max_trades_per_day">Max trades per day</Label>
                        <Input
                          id="max_trades_per_day"
                          type="number"
                          min="1"
                          value={values.max_trades_per_day}
                          onChange={(e) => set("max_trades_per_day", e.target.value)}
                          placeholder="e.g. 5"
                          autoFocus
                          aria-invalid={Boolean(fieldErrors.max_trades_per_day)}
                        />
                        <FieldError id="max_trades_per_day-error" message={fieldErrors.max_trades_per_day} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="max_open_positions">
                          Max open positions <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id="max_open_positions"
                          type="number"
                          min="0"
                          value={values.max_open_positions}
                          onChange={(e) => set("max_open_positions", e.target.value)}
                          placeholder="Leave blank for no cap"
                          aria-invalid={Boolean(fieldErrors.max_open_positions)}
                        />
                        <FieldError id="max_open_positions-error" message={fieldErrors.max_open_positions} />
                      </div>
                    </div>
                  </StepShell>
                )}

                {STEPS[step].key === "sessions" && (
                  <StepShell
                    eyebrow="Step four"
                    title="When you're allowed in"
                    description="Restrict trading to the windows your edge actually lives in. Leave them all off to allow trading anytime."
                  >
                    <div className="space-y-6">
                      <div className="space-y-4">
                        {SESSION_TOGGLES.map((toggle) => (
                          <div key={toggle.name} className="flex items-center justify-between">
                            <div>
                              <Label htmlFor={toggle.name}>{toggle.label}</Label>
                              <p className="text-xs text-muted-foreground">{toggle.hint}</p>
                            </div>
                            <Switch
                              id={toggle.name}
                              checked={values[toggle.name]}
                              onCheckedChange={(checked) => set(toggle.name, checked)}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <Label>Timezone</Label>
                        <Select value={values.timezone} onValueChange={(v) => set("timezone", v)}>
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
                      </div>
                    </div>
                  </StepShell>
                )}

                {isReview && (
                  <StepShell
                    eyebrow="Step five"
                    title="Your charter"
                    description="Read it once, sign it once. From here, TradeForce holds the line."
                  >
                    <ol>
                      {provisions.map((provision, i) => (
                        <li key={provision.label} className="ledger-row flex items-center gap-3 py-3.5">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="flex-1 text-sm">{provision.label}</span>
                          <span className="font-mono-tabular text-sm text-foreground">
                            {provision.value}
                          </span>
                          <motion.span
                            initial={false}
                            animate={
                              signing ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }
                            }
                            transition={{ duration: 0.25, delay: signing ? i * 0.18 : 0 }}
                            className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary"
                          >
                            <Check className="size-2.5" strokeWidth={3} />
                          </motion.span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-6 text-xs text-muted-foreground">
                      Signing activates enforcement immediately
                      {values.full_name ? `, ${values.full_name.trim()}` : ""}. Every provision can be
                      amended later from Rule Settings.
                    </p>
                  </StepShell>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={step === 0 || signing || pending}
              className={cn(step === 0 && "invisible")}
            >
              Back
            </Button>
            {isReview ? (
              <Button
                type="button"
                variant="gold"
                size="lg"
                onClick={handleSign}
                disabled={signing || pending}
              >
                {pending ? "Activating…" : signing ? "Signing…" : "Sign & activate charter"}
              </Button>
            ) : (
              <Button type="button" variant="gold" onClick={handleContinue}>
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
        {eyebrow}
      </p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}
