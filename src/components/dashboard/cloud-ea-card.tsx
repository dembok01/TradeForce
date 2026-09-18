"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enableCloudEaAction, disableCloudEaAction } from "@/lib/actions/cloud-ea";
import { MT5_BROKERS, brokerLabel } from "@/lib/mt5-brokers";
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
  const [server, setServer] = useState<string>(MT5_BROKERS[0].server);
  const [customServer, setCustomServer] = useState("");
  const OTHER = "__other__";
  const effectiveServer = server === OTHER ? customServer.trim() : server;
  const [pending, startTransition] = useTransition();

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
                <Select value={server} onValueChange={setServer}>
                  <SelectTrigger id="mt5-server">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MT5_BROKERS.map((b) => (
                      <SelectItem key={b.server} value={b.server}>
                        {b.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER}>My broker isn&apos;t listed…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {server === OTHER ? (
              <div className="space-y-1.5">
                <Label htmlFor="mt5-custom">Broker server address</Label>
                <Input
                  id="mt5-custom"
                  placeholder="live.yourbroker.com:443"
                  autoComplete="off"
                  value={customServer}
                  onChange={(e) => setCustomServer(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The address, not the server name — your broker&apos;s support can give you this.
                  It usually ends in <code>:443</code> or <code>:1950</code>.
                </p>
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
