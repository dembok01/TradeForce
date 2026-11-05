"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, TriangleAlert, ChevronDown, Download, Ban } from "lucide-react";
import { toast } from "sonner";
import { enableCloudEaAction, disableCloudEaAction, requestBrokerAction } from "@/lib/actions/cloud-ea";
import {
  brokerNames,
  helpFor,
  serversForBroker,
  brokerLabel,
  brokerOf,
  eaPolicyFor,
  type EaPolicy,
  type Mt5Server,
} from "@/lib/mt5-brokers";
import { looksLikePropFirm } from "@/lib/prop-firms";
import type { CloudEa, ConnectionStep } from "@/lib/data/cloud-ea";
import { signInHelp } from "@/lib/connection-help";
import { formatDistanceToNowStrict } from "date-fns";
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

// Every step of this trader's connection, newest first: what the website did,
// what the terminal did, and - when something failed - what to do about it.
// Open by default when the latest step is a problem.
function ConnectionLog({ steps }: { steps: ConnectionStep[] }) {
  if (steps.length === 0) return null;
  const dot = { info: "bg-emerald-500", warn: "bg-amber-500", error: "bg-destructive" } as const;
  return (
    <details className="rounded-lg border" open={steps[0].level !== "info"}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">What&apos;s happened so far</summary>
      <ol className="space-y-2 border-t px-3 py-2.5 text-sm">
        {steps.map((st, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[st.level]}`} aria-hidden />
            <span className="flex-1">{st.message}</span>
            <time
              dateTime={st.at}
              suppressHydrationWarning
              className="shrink-0 text-xs text-muted-foreground"
            >
              {formatDistanceToNowStrict(new Date(st.at), { addSuffix: true })}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}

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

const EA_DOWNLOAD_PATH = "/downloads/TradeForce.ex5";

/**
 * What a funded trader sees instead of the password form.
 *
 * Hosting a prop-firm account is not a shared-IP problem - that part is
 * fixable. It is that every firm checked requires the named account holder to
 * place the trades, and a hosted terminal means we hold their password. Running
 * the same EA on their own MetaTrader removes the clause entirely, and removes
 * the datacentre IP, the shared machine identity and the 24/7 session with it.
 *
 * The trade is honest and worth stating plainly: protection then only runs while
 * their computer does. On a funded account the firm's own daily drawdown is the
 * hard limit anyway, so what TradeForce adds there is discipline, not a backstop.
 */
function FundedAccountNotice({ policy, firm }: { policy: EaPolicy; firm: string }) {
  const who = firm.trim() || "Your firm";

  if (policy === "prohibited") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Ban className="size-4 shrink-0 text-destructive" aria-hidden />
          {who} does not allow Expert Advisors
        </p>
        <p className="mt-1 text-muted-foreground">
          Their terms prohibit EAs, bots and scripts on every account and every platform, so there
          is no setup we can offer that keeps you inside your agreement — not our hosted terminal
          and not the downloadable EA either. Connecting anyway would put your account and your
          payout at risk, so we won&apos;t do it.
        </p>
        <p className="mt-2 text-muted-foreground">
          You can still use TradeForce on an ordinary broker account. If you believe their policy
          has changed, ask them in writing and send us their reply — we&apos;ll re-check it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <div>
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          Funded account — run the EA on your own MetaTrader
        </p>
        <p className="mt-1 text-muted-foreground">
          {who} requires that you place your own trades, so we don&apos;t host funded accounts: a
          hosted terminal means we hold your trading password, and that is the clause that costs
          traders their accounts. Download the EA and attach it to your own MetaTrader instead —
          your rules, limits and dashboard all work exactly the same.
        </p>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Download the EA and drop it into your MetaTrader&apos;s Experts folder.</li>
        <li>Attach it to any chart, then paste your EA key from Rule Settings.</li>
        {policy === "approval_required" ? (
          <li>
            <strong>Get {who}&apos;s written approval first.</strong> They review and approve EAs in
            advance — keep their reply, it is what protects your payout if you are ever asked.
          </li>
        ) : null}
      </ol>

      <Button asChild variant="outline" size="sm">
        <a href={EA_DOWNLOAD_PATH} download>
          <Download className="size-4" aria-hidden />
          Download TradeForce.ex5
        </a>
      </Button>

      <p className="text-xs text-muted-foreground">
        One honest difference: the EA protects you only while your computer is running. We&apos;ll
        tell you if it stops reporting, so you are never unprotected without knowing.
      </p>
    </div>
  );
}

export function CloudEaCard({
  initial,
  propFirm,
  servers: catalogue,
}: {
  initial: CloudEa;
  propFirm?: string | null;
  /** Loaded from mt5_brokers by the page, so admins can add one without a deploy. */
  servers: Mt5Server[];
}) {
  const router = useRouter();
  const [login, setLogin] = useState(initial.login ?? "");
  const [password, setPassword] = useState("");
  // After a refused sign-in, start from what they sent: usually only the
  // password (or the demo/live server) was wrong.
  const previousBroker = brokerOf(catalogue, initial.server);
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
  const servers = isOther ? [] : serversForBroker(catalogue, broker);
  const effectiveServer = isOther ? customServer.trim() : serverAddress;
  const brokerName = isOther ? otherBroker.trim() : broker;
  // Exness servers go by name (see mt5-brokers.ts), so its "not listed" path
  // asks for the exact server name rather than an address.
  const otherIsExness = isOther && /exness/i.test(otherBroker);
  // Onboarding asks for the trader's prop firm, so a funded trader is warned even
  // when their account sits at an ordinary-looking broker address.
  const propRisk = looksLikePropFirm(brokerName, effectiveServer, requestServerName, propFirm);
  // Exact, from the catalogue: a prop firm we have actually read the contract
  // of, which is refused server-side too. propRisk stays the fuzzy fallback for
  // a firm reached by a typed address we have never catalogued.
  const eaPolicy = eaPolicyFor(catalogue, effectiveServer);

  function pickBroker(value: string) {
    setBroker(value);
    setRequested(false);
    const found = value === OTHER ? [] : serversForBroker(catalogue, value);
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
                  Account {initial.login} · {initial.server ? brokerLabel(catalogue, initial.server) : ""}
                </p>
                {initial.detail ? (
                  <p className="mt-1 text-muted-foreground">{initial.detail}</p>
                ) : null}
              </div>
            </div>

            <ConnectionLog steps={initial.log} />

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
                {signInHelp(initial.detail) ? (
                  <p className="mt-2 font-medium">{signInHelp(initial.detail)}</p>
                ) : null}
                <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                  <li>
                    Use the <strong>trading</strong> (master) password for account {initial.login}
                    — not the investor password or your broker website login.
                  </li>
                  <li>
                    Check the server:{" "}
                    {previousBroker && helpFor(catalogue, previousBroker)
                      ? helpFor(catalogue, previousBroker)
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
                {brokerNames(catalogue).map((name) => (
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
                {helpFor(catalogue, broker) ? (
                  <p className="text-xs text-muted-foreground">{helpFor(catalogue, broker)}</p>
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
                  <Label htmlFor="mt5-custom">{otherIsExness ? "Exness server name" : "Server address"}</Label>
                  <Input
                    id="mt5-custom"
                    placeholder={otherIsExness ? "e.g. Exness-MT5Real45" : "live.yourbroker.com:443"}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="url"
                    value={customServer}
                    onChange={(e) => setCustomServer(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {otherIsExness ? (
                      helpFor(catalogue, "Exness")
                    ) : (
                      <>
                        Ask your broker&apos;s support for “the MT5 server address and port” for your
                        account — they answer this every day. It is the address, not the server name:{" "}
                        <code>ICMarketsSC-Demo</code> is a name, <code>mt5-demo.icmarkets.com:443</code>{" "}
                        is an address.
                      </>
                    )}
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

            {eaPolicy ? (
              <FundedAccountNotice policy={eaPolicy} firm={brokerName} />
            ) : (
              <>
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
                      Nearly every prop firm requires that you place your own trades, which rules out a
                      hosted terminal because we would be holding your password. Many also restrict
                      Expert Advisors or shared servers (VPS). Breaking those rules can cost you the
                      account and any payout already earned.
                    </p>
                    <p className="mt-2 text-muted-foreground">
                      If this is a funded or challenge account, don&apos;t connect it here — download the
                      EA and run it on your own MetaTrader instead. It keeps your rules and keeps you
                      inside your agreement.{" "}
                      <a className="underline underline-offset-2" href={EA_DOWNLOAD_PATH} download>
                        Download TradeForce.ex5
                      </a>
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

                {initial.status === "login_failed" ? <ConnectionLog steps={initial.log} /> : null}

                <Button
                  onClick={handleEnable}
                  disabled={pending || !login || !password || !effectiveServer || (propRisk && !propConfirmed)}
                >
                  {pending ? "Connecting…" : "Connect my account"}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
