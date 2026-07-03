"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { motion } from "motion/react";
import { Trash2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { updateTradeNotesAction, deleteTradeAction } from "@/lib/actions/trades";
import type { Trade } from "@/lib/data/trades";
import { formatSignedCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TradeFormDialog } from "@/components/dashboard/trade-form-dialog";
import {
  LedgerTable,
  LedgerHeaderRow,
  LedgerHeaderCell,
  LedgerCell,
  LEDGER_ROW_CLASSES,
} from "@/components/ui/ledger-table";
import { cn } from "@/lib/utils";

function NotesCell({ trade }: { trade: Trade }) {
  const [value, setValue] = useState(trade.notes ?? "");
  const [, startTransition] = useTransition();

  return (
    <Textarea
      defaultValue={value}
      placeholder="Add a note…"
      rows={1}
      className="min-h-8 resize-y border-transparent bg-transparent px-2 py-1 text-xs hover:border-input focus-visible:border-ring"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value === (trade.notes ?? "")) return;
        startTransition(async () => {
          try {
            await updateTradeNotesAction(trade.id, value);
          } catch {
            toast.error("Couldn't save note.");
          }
        });
      }}
    />
  );
}

export function TradeTable({ trades }: { trades: Trade[] }) {
  // Remove the row immediately; useOptimistic reconciles with the revalidated
  // server list, and reverts if the delete throws.
  const [optimisticTrades, removeOptimistic] = useOptimistic(trades, (state, removedId: string) =>
    state.filter((t) => t.id !== removedId)
  );
  const [, startTransition] = useTransition();

  // Rows present at mount stagger in; rows that appear later (a freshly logged
  // trade arriving via revalidation) get a one-time gold flash instead.
  const seenIds = useRef<Set<string> | null>(null);
  const isInitialRender = seenIds.current === null;
  if (seenIds.current === null) seenIds.current = new Set(trades.map((t) => t.id));

  function handleDelete(id: string) {
    startTransition(async () => {
      removeOptimistic(id);
      try {
        await deleteTradeAction(id);
      } catch {
        toast.error("Couldn't delete trade.");
      }
    });
  }

  if (optimisticTrades.length === 0) {
    return (
      <EmptyState title="No trades in this range" icon={ScrollText} action={<TradeFormDialog />}>
        Log one manually, or connect your EA in Phase 2 to fill this automatically.
      </EmptyState>
    );
  }

  return (
    <LedgerTable className="min-w-[760px]">
      <thead>
        <LedgerHeaderRow>
          <LedgerHeaderCell sticky>Symbol</LedgerHeaderCell>
          <LedgerHeaderCell>Direction</LedgerHeaderCell>
          <LedgerHeaderCell>Entry</LedgerHeaderCell>
          <LedgerHeaderCell>Exit</LedgerHeaderCell>
          <LedgerHeaderCell>P/L</LedgerHeaderCell>
          <LedgerHeaderCell>Date/Time</LedgerHeaderCell>
          <LedgerHeaderCell>Notes</LedgerHeaderCell>
          <LedgerHeaderCell className="pr-0" />
        </LedgerHeaderRow>
      </thead>
      <tbody>
        {optimisticTrades.map((trade, index) => {
          const isNew = !isInitialRender && !seenIds.current!.has(trade.id);
          if (isNew) seenIds.current!.add(trade.id);
          return (
          <motion.tr
            key={trade.id}
            className={cn(LEDGER_ROW_CLASSES)}
            initial={
              isNew
                ? { opacity: 0, backgroundColor: "hsl(42 62% 58% / 0.14)" }
                : { opacity: 0 }
            }
            animate={
              isNew
                ? { opacity: 1, backgroundColor: "hsl(42 62% 58% / 0)" }
                : { opacity: 1 }
            }
            transition={
              isNew
                ? { duration: 0.25, backgroundColor: { duration: 1.6, ease: "easeOut" } }
                : { duration: 0.3, delay: Math.min(index * 0.03, 0.3), ease: "easeOut" }
            }
          >
            <LedgerCell sticky className="font-medium">{trade.symbol}</LedgerCell>
            <LedgerCell>
              <Badge variant={trade.direction === "LONG" ? "success" : "secondary"}>
                {trade.direction}
              </Badge>
            </LedgerCell>
            <LedgerCell mono className="text-muted-foreground">
              {trade.entry_price}
            </LedgerCell>
            <LedgerCell mono className="text-muted-foreground">
              {trade.exit_price ?? "—"}
            </LedgerCell>
            <LedgerCell
              mono
              className={cn(
                trade.pnl === null
                  ? "text-muted-foreground"
                  : trade.pnl >= 0
                    ? "text-success"
                    : "text-destructive"
              )}
            >
              {trade.pnl !== null ? formatSignedCurrency(trade.pnl) : "—"}
            </LedgerCell>
            <LedgerCell mono className="text-muted-foreground">
              {format(new Date(trade.entry_time), "MMM d, yyyy HH:mm")}
            </LedgerCell>
            <LedgerCell className="w-56 py-1.5">
              <NotesCell trade={trade} />
            </LedgerCell>
            <LedgerCell className="pr-0">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${trade.symbol} trade`}
                onClick={() => handleDelete(trade.id)}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </LedgerCell>
          </motion.tr>
          );
        })}
      </tbody>
    </LedgerTable>
  );
}
