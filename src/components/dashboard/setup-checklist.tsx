"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Radio } from "lucide-react";
import {
  EA_DOWNLOADED_COOKIE,
  SETUP_DONE_COOKIE,
  type SetupChecklist,
  type SetupStepId,
} from "@/lib/setup-checklist";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const POLL_MS = 5_000;
const EA_DOWNLOAD_PATH = "/downloads/TradeForce.ex5";

function setCookie(name: string) {
  document.cookie = `${name}=1; path=/; max-age=31536000; SameSite=Lax`;
}

type StepCopy = { title: string; auto: string | null };

const STEP_COPY: Record<SetupStepId, StepCopy> = {
  "generate-key": { title: "Generate your EA key", auto: "Verified when a key exists" },
  "download-ea": { title: "Download the TradeForce EA", auto: null },
  install: { title: "Install it in MetaTrader 5", auto: "Verified by your terminal's first check-in" },
  "first-checkin": { title: "Connect your terminal", auto: "Verified live — no box to tick" },
  "first-trade": { title: "Take your first enforced trade", auto: "Verified when a trade reports back" },
};

export function SetupChecklistPanel({
  initialChecklist,
  initialLastSeenAt,
  siteUrl,
}: {
  initialChecklist: SetupChecklist;
  initialLastSeenAt: string | null;
  siteUrl: string;
}) {
  const router = useRouter();
  const [checklist, setChecklist] = useState(initialChecklist);
  const [lastSeenAt, setLastSeenAt] = useState(initialLastSeenAt);
  const [openStep, setOpenStep] = useState<SetupStepId | null>(
    initialChecklist.steps.find((s) => !s.done)?.id ?? null
  );
  // Steps that flipped to done while the user watched — these get the stamp
  // animation; steps already done at mount render a static check.
  const [justCompleted, setJustCompleted] = useState<Set<SetupStepId>>(new Set());
  const prevDone = useRef(new Map(initialChecklist.steps.map((s) => [s.id, s.done])));
  const doneStamped = useRef(false);

  useEffect(() => {
    if (checklist.done) return;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/setup-status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          checklist?: SetupChecklist;
          lastSeenAt?: string | null;
        };
        if (cancelled || !data.checklist) return;
        setChecklist(data.checklist);
        setLastSeenAt(data.lastSeenAt ?? null);
      } catch {
        // Transient network blips: the next tick retries.
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [checklist.done]);

  // Detect fresh completions for the stamp animation + advance the open step.
  useEffect(() => {
    const fresh = checklist.steps.filter((s) => s.done && prevDone.current.get(s.id) === false);
    if (fresh.length > 0) {
      setJustCompleted((prev) => {
        const next = new Set(prev);
        for (const s of fresh) next.add(s.id);
        return next;
      });
      setOpenStep(checklist.steps.find((s) => !s.done)?.id ?? null);
    }
    prevDone.current = new Map(checklist.steps.map((s) => [s.id, s.done]));
  }, [checklist]);

  useEffect(() => {
    if (checklist.done && !doneStamped.current) {
      doneStamped.current = true;
      setCookie(SETUP_DONE_COOKIE);
      // Refresh so the sidebar affordance and journal lock pick it up.
      router.refresh();
    }
  }, [checklist.done, router]);

  function markDownloaded() {
    setCookie(EA_DOWNLOADED_COOKIE);
    setChecklist((prev) => {
      const steps = prev.steps.map((s) => (s.id === "download-ea" ? { ...s, done: true } : s));
      const completedCount = steps.filter((s) => s.done).length;
      return { ...prev, steps, completedCount, done: completedCount === prev.total };
    });
  }

  const waitingForTerminal =
    !checklist.steps.find((s) => s.id === "first-checkin")?.done &&
    Boolean(checklist.steps.find((s) => s.id === "generate-key")?.done);

  const bodies: Record<SetupStepId, React.ReactNode> = {
    "generate-key": (
      <p>
        On{" "}
        <Link href="/dashboard/settings" className="text-primary hover:underline">
          Rule Settings
        </Link>
        , generate an EA key. It&apos;s shown once — copy it somewhere safe before closing the
        dialog. This checklist ticks itself the moment the key exists.
      </p>
    ),
    "download-ea": (
      <>
        <p>The compiled Expert Advisor for MetaTrader 5.</p>
        <Button variant="gold" size="sm" className="mt-3" asChild>
          <a href={EA_DOWNLOAD_PATH} download onClick={markDownloaded}>
            Download TradeForce.ex5
          </a>
        </Button>
      </>
    ),
    install: (
      <div className="space-y-2">
        <p>
          In MT5: <strong>File → Open Data Folder</strong>, copy the file into{" "}
          <code>MQL5/Experts/</code>, then right-click <strong>Expert Advisors</strong> in the
          Navigator and hit <strong>Refresh</strong>.
        </p>
        <p>
          Then <strong>Tools → Options → Expert Advisors</strong>: tick{" "}
          <strong>&ldquo;Allow WebRequest for listed URL&rdquo;</strong> and add{" "}
          <code className="break-all">{siteUrl}</code>. Without this, MT5 silently blocks every
          request the EA makes.
        </p>
      </div>
    ),
    "first-checkin": (
      <div className="space-y-3">
        <p>
          Drag TradeForce onto the chart you trade. In the inputs dialog, paste your key into{" "}
          <code>ApiKey</code> and set <code>ServerUrl</code> to{" "}
          <code className="break-all">{siteUrl}</code>. Then click{" "}
          <strong>AutoTrading</strong> in the toolbar so it turns green.
        </p>
        {waitingForTerminal && (
          <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Radio className="size-3.5" />
            </motion.span>
            Waiting for your terminal&apos;s first check-in — this flips the moment the EA pings.
          </div>
        )}
      </div>
    ),
    "first-trade": (
      <p>
        Open (and close) any small trade on your demo account. Within a minute it appears in your{" "}
        <Link href="/dashboard/journal" className="text-primary hover:underline">
          Journal
        </Link>{" "}
        with an <strong>EA</strong> badge — proof the enforced record is live
        {lastSeenAt ? "" : " once your terminal is connected"}.
      </p>
    ),
  };

  return (
    <div className="space-y-3">
      {checklist.steps.map((step, i) => {
        const copy = STEP_COPY[step.id];
        const open = openStep === step.id;
        const stamped = justCompleted.has(step.id);
        return (
          <Card
            key={step.id}
            className={cn(
              "transition-colors",
              step.done ? "border-primary/20" : open && "border-primary/30"
            )}
          >
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => setOpenStep(open ? null : step.id)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left"
                aria-expanded={open}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm",
                    step.done
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {step.done ? (
                    <motion.span
                      initial={stamped ? { scale: 0.2, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    >
                      <Check className="size-4" />
                    </motion.span>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      step.done ? "text-muted-foreground line-through decoration-primary/40" : ""
                    )}
                  >
                    {copy.title}
                  </span>
                  {copy.auto && !step.done && (
                    <span className="block text-xs text-muted-foreground">{copy.auto}</span>
                  )}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 pl-16 text-sm text-muted-foreground">
                      {bodies[step.id]}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        );
      })}

      {checklist.done && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-gold-glow rounded-xl border border-primary/30 bg-primary/5 p-5"
        >
          <p className="font-display text-base font-medium">Enforcement is live.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your terminal is connected and reporting. Every rule in your charter now executes in
            MetaTrader — violations are closed and logged automatically.
          </p>
        </motion.div>
      )}
    </div>
  );
}
