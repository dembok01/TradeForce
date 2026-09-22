"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, TriangleAlert, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { enableCloudEaAction, disableCloudEaAction, requestBrokerAction } from "@/lib/actions/cloud-ea";
import {
  MT5_BROKER_NAMES,
  BROKER_HELP,
  serversForBroker,
  brokerLabel,
  brokerOf,
} from "@/lib/mt5-brokers";
import { looksLikePropFirm } from "@/lib/prop-firms";
import type { CloudEa } from "@/lib/data/cloud-ea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

/** "Other broker…" in the broker list. */
const OTHER = "__other";

// A native <select>: the phone's own picker. The broker field used to be a text
// box with a <datalist>, which iOS Safari and many Android browsers never show
// as a dropdown - traders on mobile saw an empty box and nothing to pick.
function NativeSelect(props: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className="h-10 w-full appearance-none rounded-md border border-input bg-background/40 px-3 pr-9 text-base shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 sm:h-9 sm:text-sm"
      />
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-60"
        aria-hidden
      />
    </div>
  );
}

const STATUS: Record<
  CloudEa["status"],
  { label: string; variant: "success" | "warning" | "destructive" | "secondary"; blurb: string }
> = {
  off: { label: "Off", variant: "secondary", blurb: "" },
  starting: {
    label: "Starting…",
    variant: "warning",
    blurb: "Setting up your cloud terminal. This usually takes a few minutes.",
  },
  protected: {
    label: "Protected 24/7",
    variant: "success",
    blurb: "Your charter is enforced even with your computer switched off.",
  },
  reconnecting: {
    label: "Reconnecting…",
    variant: "warning",
    blurb: "The cloud terminal hasn't reported in a few minutes. Recovering automatically.",
  },
  login_failed: {
    label: "Login failed",
    variant: "destructive",
    blurb: "We couldn't sign in to your broker. Check the account number and password.",
  },
  error: {
    label: "Problem",
    variant: "destructive",
    blurb: "Something went wrong starting your cloud terminal.",
  },
  stopped: { label: "Stopped", variant: "secondary", blurb: "Cloud protection is paused." },
};

/** Terminals start one at a time; a fresh one takes about this long. */
const MINUTES_PER_START = 4;

// What "Starting…" means right now. Terminals start one at a time, so a burst
// of signups is a queue - say so, or people keep pressing Connect, which only
// sends them to the back of it.
function startingBlurb(c: CloudEa): string | null {
  if (c.status !== "starting") return null;
  const noRetry = " You'll be protected automatically - there's no need to press Connect again.";
  if (c.serversFull)
    return "All our trading servers are full right now. You're in the queue and will be connected as soon as a place frees up - our team has been alerted." + noRetry;
  if ((c.queueAhead ?? 0) > 0) {
    const place = (c.queueAhead ?? 0) + 1;
    return `Lots of traders are connecting right now. You're number ${place} in the queue - about ${place * MINUTES_PER_START} minutes.` + noRetry;
  }
  if ((c.waitedMinutes ?? 0) >= 10)
    return "This is taking longer than usual. We've been alerted and are on it." + noRetry;
  return null;
}

export function CloudEaCard({ initial, propFirm }: { initial: CloudEa; propFirm?: string | null }) {
  const router = useRouter();
  const [login, setLogin] = useState(initial.login ?? "");
  const [password, setPassword] = useState("");
  // After a refused sign-in, start from what they sent: usually only the
  // password (or the demo/live server) was wrong.
  const previousBroker = brokerOf(initial.server);
  const [broker, setBroker] = useState(
    previousBroker ?? (initial.server ? OTHER : "")
  );
  const [serverAddress, setServerAddress] = useState(previousBroker ? (initial.server ?? "") : "");
  const [otherBroker, setOtherBroker] = useState("");
  const [customServer, setCustomServer] = useState(previousBroker ? "" : (initial.server ?? ""));
  const [requestServerName, setRequestServerName] = useState("");
  const [requested, setRequested] = useState(false);
  const [propConfirmed, setPropConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const isOther = broker === OTHER;
  const servers = isOther ? [] : serversForBroker(broker);
  const effectiveServer = isOther ? customServer.trim() : serverAddress;
  const brokerName = isOther ? otherBroker.trim() : broker;
  // Onboarding asks for the trader's prop firm, so a funded trader is warned even
  // when their account sits at an ordinary-looking broker address.
  const propRisk = looksLikePropFirm(brokerName, effectiveServer, requestServerName, propFirm);

  function pickBroker(value: string) {
    setBroker(value);
    setRequested(false);
    const found = value === OTHER ? [] : serversForBroker(value);
    setServerAddress(found.length === 1 ? found[0].address : "");
  }

  // "My server isn't in this list": same broker, their own address.
  function useOwnServer() {
    setOtherBroker(broker);
    pickBroker(OTHER);
  }

  function handleRequestBroker() {
    startTransition(async () => {
      const result = await requestBrokerAction({ broker: brokerName, serverName: requestServerName });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setRequested(true);
      toast.success("Thanks — we'll add your broker and email you when it's ready.");
    });
  }

  const s = STATUS[initial.status];
  // "Login failed" means the details were wrong, so ask for them again rather
  // than leaving the trader with nothing but a Turn-off button.
  const needsDetails = !initial.enabled || initial.status === "login_failed";

  function handleEnable() {
    startTransition(async () => {
      const result = await enableCloudEaAction({ login, password, server: effectiveServer });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setPassword("");
      toast.success("Setting up your cloud terminal — this usually takes a few minutes.");
      router.refresh();
    });
  }

  function handleDisable() {
    startTransition(async () => {
      const result = await disableCloudEaAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Cloud protection turned off.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" aria-hidden />
              Your MetaTrader account
            </CardTitle>
            <CardDescription>
              We sign in to your broker and run your terminal for you. Your rules are enforced
              around the clock — including trades you place on your phone, with your own computer
              switched off.
            </CardDescription>
          </div>
          {initial.enabled ? <Badge variant={s.variant}>{s.label}</Badge> : null}
        </div>
      </CardHeader>

      <CardContent>
        {!needsDetails ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              {initial.status === "protected" ? (
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" aria-hidden />
              ) : (
                <Loader2
                  className={`mt-0.5 size-5 shrink-0 text-muted-foreground ${
                    initial.status === "starting" ? "animate-spin" : ""
                  }`}
                  aria-hidden
                />
              )}
              <div className="text-sm">
                <p>{startingBlurb(initial) ?? s.blurb}</p>
                <p className="mt-1 text-muted-foreground">
                  Account {initial.login} · {initial.server ? brokerLabel(initial.server) : ""}
                </p>
                {initial.detail ? (
                  <p className="mt-1 text-muted-foreground">{initial.detail}</p>
                ) : null}
              </div>
            </div>

            <Button variant="outline" onClick={handleDisable} disabled={pending}>
              {pending ? "Working…" : "Turn off cloud protection"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {initial.status === "login_failed" ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium">{s.blurb}</p>
                {initial.detail ? <p className="mt-1">{initial.detail}</p> : null}
                <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                  <li>
                    Use the <strong>trading</strong> (master) password for account {initial.login}
                    — not the investor password or your broker website login.
                  </li>
                  <li>
                    Check the server:{" "}
                    {previousBroker && BROKER_HELP[previousBroker]
                      ? BROKER_HELP[previousBroker]
                      : "demo and real accounts are on different servers, and the account only exists on its own one."}
                  </li>
                </ul>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="mt5-broker">Broker</Label>
              <NativeSelect id="mt5-broker" value={broker} onChange={(e) => pickBroker(e.target.value)}>
                <option value="" disabled>
                  Choose your broker
                </option>
                {MT5_BROKER_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value={OTHER}>Other broker…</option>
              </NativeSelect>
            </div>

            {servers.length > 0 ? (
              <div className="space-y-1.5">
                <Label htmlFor="mt5-server">Server</Label>
                <NativeSelect
                  id="mt5-server"
                  value={serverAddress}
                  onChange={(e) => setServerAddress(e.target.value)}
                >
                  {servers.length > 1 ? (
                    <option value="" disabled>
                      Choose the server your account is on
                    </option>
                  ) : null}
                  {servers.map((sv) => (
                    <option key={sv.address} value={sv.address}>
                      {sv.label}
                    </option>
                  ))}
                </NativeSelect>
                {BROKER_HELP[broker] ? (
                  <p className="text-xs text-muted-foreground">{BROKER_HELP[broker]}</p>
                ) : null}
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2"
                  onClick={useOwnServer}
                >
                  My server isn&apos;t in this list
                </button>
              </div>
            ) : null}

            {isOther ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mt5-other-broker">Broker name</Label>
                  <Input
                    id="mt5-other-broker"
                    autoComplete="off"
                    placeholder="e.g. XM, FBS, Tickmill"
                    value={otherBroker}
                    onChange={(e) => {
                      setOtherBroker(e.target.value);
                      setRequested(false);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mt5-custom">Server address</Label>
                  <Input
                    id="mt5-custom"
                    placeholder="live.yourbroker.com:443"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="url"
                    value={customServer}
                    onChange={(e) => setCustomServer(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ask your broker&apos;s support for “the MT5 server address and port” for your
                    account — they answer this every day. It is the address, not the server name:{" "}
                    <code>ICMarketsSC-Demo</code> is a name, <code>mt5-demo.icmarkets.com:443</code>{" "}
                    is an address.
                  </p>
                </div>
                <div className="space-y-1.5 border-t pt-3">
                  <p className="text-sm">No address? We&apos;ll find it and add your broker, usually the same day.</p>
                  <Input
                    id="mt5-server-name"
                    autoComplete="off"
                    placeholder="Your server name, if you know it (e.g. XMGlobal-MT5 2)"
                    value={requestServerName}
                    onChange={(e) => setRequestServerName(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRequestBroker}
                    disabled={pending || requested || !brokerName}
                  >
                    {requested ? "Request sent" : `Ask us to add ${brokerName || "my broker"}`}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mt5-login">MT5 account number</Label>
                <Input
                  id="mt5-login"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 53168878"
                  value={login}
                  onChange={(e) => setLogin(e.target.value.replace(/\s/g, ""))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt5-password">MT5 trading password</Label>
                <Input
                  id="mt5-password"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {propRisk ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />
                  Prop-firm account? Check your firm&apos;s rules before connecting.
                </p>
                <p className="mt-1 text-muted-foreground">
                  Many prop firms don&apos;t allow Expert Advisors, hosted or shared servers (VPS),
                  or someone else signing in to your account — on challenge and funded accounts
                  alike. FundedNext, for example, bans all of these on larger accounts and on free
                  trials. Breaking your firm&apos;s rules can cost you the account, so if you&apos;re
                  not sure, ask your firm first or use an ordinary broker account.
                </p>
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={propConfirmed}
                    onChange={(e) => setPropConfirmed(e.target.checked)}
                  />
                  <span>I&apos;ve checked: my firm allows an EA and a hosted terminal on this account.</span>
                </label>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Your password is encrypted before it is stored and is only ever used to sign this
              terminal in to your broker. Use your <strong>trading</strong> password — never your
              investor or website password. We can never withdraw funds.
            </p>

            <Button
              onClick={handleEnable}
              disabled={pending || !login || !password || !effectiveServer || (propRisk && !propConfirmed)}
            >
              {pending ? "Connecting…" : "Connect my account"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
