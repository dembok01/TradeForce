"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enableCloudEaAction, disableCloudEaAction, requestBrokerAction } from "@/lib/actions/cloud-ea";
import { MT5_BROKER_NAMES, serversForBroker, brokerLabel } from "@/lib/mt5-brokers";
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

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

export function CloudEaCard({ initial }: { initial: CloudEa }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [broker, setBroker] = useState("");
  const [serverAddress, setServerAddress] = useState("");
  const [manual, setManual] = useState(false);
  const [customServer, setCustomServer] = useState("");
  const [requestServerName, setRequestServerName] = useState("");
  const [requested, setRequested] = useState(false);
  const [pending, startTransition] = useTransition();

  // A broker the trader types is only useful once it maps to one of that
  // broker's servers: demo and live are different addresses.
  const servers = serversForBroker(broker);
  const known = servers.length > 0;
  const effectiveServer = manual ? customServer.trim() : serverAddress;

  function pickBroker(value: string) {
    setBroker(value);
    setManual(false);
    setRequested(false);
    const found = serversForBroker(value);
    setServerAddress(found.length === 1 ? found[0].address : "");
  }

  function handleRequestBroker() {
    startTransition(async () => {
      const result = await requestBrokerAction({ broker, serverName: requestServerName });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setRequested(true);
      toast.success("Thanks — we'll add your broker and email you when it's ready.");
    });
  }

  const s = STATUS[initial.status];

  function handleEnable() {
    startTransition(async () => {
      const result = await enableCloudEaAction({ login, password, server: effectiveServer });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setPassword("");
      toast.success("Setting up your cloud terminal — this takes about a minute.");
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
              <Smartphone className="size-4" aria-hidden />
              Protect me on mobile
            </CardTitle>
            <CardDescription>
              We run MetaTrader for you, so your rules are enforced when your PC is off — including
              trades you place from the phone app.
            </CardDescription>
          </div>
          {initial.enabled ? <Badge variant={s.variant}>{s.label}</Badge> : null}
        </div>
      </CardHeader>

      <CardContent>
        {initial.enabled ? (
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
                <p>{s.blurb}</p>
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
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="mt5-login">MT5 account number</Label>
                <Input
                  id="mt5-login"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="10012085487"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt5-password">MT5 password</Label>
                <Input
                  id="mt5-password"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt5-server">Broker</Label>
                <Input
                  id="mt5-server"
                  list="mt5-broker-names"
                  autoComplete="off"
                  placeholder="Start typing…"
                  value={broker}
                  onChange={(e) => pickBroker(e.target.value)}
                />
                <datalist id="mt5-broker-names">
                  {MT5_BROKER_NAMES.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>

            {known && !manual ? (
              <div className="space-y-1.5">
                <Label htmlFor="mt5-account-type">Which account?</Label>
                <Select value={serverAddress} onValueChange={setServerAddress}>
                  <SelectTrigger id="mt5-account-type">
                    <SelectValue placeholder="Choose demo or live" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((b) => (
                      <SelectItem key={b.address} value={b.address}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2"
                  onClick={() => setManual(true)}
                >
                  My account is on a different server
                </button>
              </div>
            ) : null}

            {!known && broker.trim() && !manual ? (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm">
                  We don&apos;t have <strong>{broker.trim()}</strong> on file yet. Two ways forward:
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="mt5-server-name">Your server name (optional)</Label>
                  <Input
                    id="mt5-server-name"
                    autoComplete="off"
                    placeholder="e.g. ICMarketsSC-Demo"
                    value={requestServerName}
                    onChange={(e) => setRequestServerName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    It&apos;s in your broker&apos;s welcome email, and in MetaTrader under the account
                    name.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleRequestBroker} disabled={pending || requested}>
                    {requested ? "Request sent" : "Ask us to add this broker"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setManual(true)}>
                    I have my server address
                  </Button>
                </div>
                {requested ? (
                  <p className="text-xs text-muted-foreground">
                    We usually add a broker the same day and email you — no need to do anything else.
                  </p>
                ) : null}
              </div>
            ) : null}

            {manual ? (
              <div className="space-y-1.5">
                <Label htmlFor="mt5-custom">Broker server address</Label>
                <Input
                  id="mt5-custom"
                  placeholder="live.yourbroker.com:443"
                  autoComplete="off"
                  value={customServer}
                  onChange={(e) => setCustomServer(e.target.value)}
                />
                <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Where to find this</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-4">
                    <li>
                      Open MetaTrader 5 on a computer and sign in to this account. The bottom-right
                      corner of the window shows the address it is connected to, like{" "}
                      <code>78.140.180.20:443</code>.
                    </li>
                    <li>
                      Or ask your broker&apos;s support for “the MT5 server address and port” — they
                      answer this every day.
                    </li>
                  </ol>
                  <p className="mt-2">
                    It is the address, not the server name: <code>ICMarketsSC-Demo</code> is a name,{" "}
                    <code>mt5-demo.icmarkets.com:443</code> is an address. Ports are usually{" "}
                    <code>443</code> or <code>1950</code>.
                  </p>
                  <button
                    type="button"
                    className="mt-2 underline underline-offset-2"
                    onClick={() => setManual(false)}
                  >
                    Back to the broker list
                  </button>
                </div>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Your password is encrypted before it is stored and is only ever used to sign this
              terminal in to your broker. Use your <strong>trading</strong> password — never your
              investor or website password. We can never withdraw funds.
            </p>

            <Button onClick={handleEnable} disabled={pending || !login || !password || !effectiveServer}>
              {pending ? "Starting…" : "Enable 24/7 protection"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
