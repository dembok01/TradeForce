"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createTradeAction, type TradeActionState } from "@/lib/actions/trades";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: TradeActionState = { error: null };

export function TradeFormDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createTradeAction, initialState);
  const errors = state.fieldErrors;

  useEffect(() => {
    if (state.success) {
      toast.success("Trade logged.");
      // Closing the dialog in response to a completed server action (not every
      // render) is the correct use of an effect here — the actual state lives
      // in useActionState, this just mirrors it into the dialog's open state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold" size="sm">
          <Plus className="size-4" />
          Log trade
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a trade</DialogTitle>
          <DialogDescription>Manual entry — once your EA is connected, this fills itself.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                name="symbol"
                required
                placeholder="EURUSD"
                autoFocus
                aria-invalid={Boolean(errors?.symbol)}
                aria-describedby={errors?.symbol ? "symbol-error" : undefined}
              />
              <FieldError id="symbol-error" message={errors?.symbol} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="direction">Direction</Label>
              <Select name="direction" defaultValue="LONG">
                <SelectTrigger id="direction" aria-invalid={Boolean(errors?.direction)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LONG">Long</SelectItem>
                  <SelectItem value="SHORT">Short</SelectItem>
                </SelectContent>
              </Select>
              <FieldError id="direction-error" message={errors?.direction} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entry_price">Entry price</Label>
              <Input
                id="entry_price"
                name="entry_price"
                type="number"
                step="any"
                required
                aria-invalid={Boolean(errors?.entry_price)}
                aria-describedby={errors?.entry_price ? "entry_price-error" : undefined}
              />
              <FieldError id="entry_price-error" message={errors?.entry_price} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exit_price">Exit price</Label>
              <Input
                id="exit_price"
                name="exit_price"
                type="number"
                step="any"
                aria-invalid={Boolean(errors?.exit_price)}
                aria-describedby={errors?.exit_price ? "exit_price-error" : undefined}
              />
              <FieldError id="exit_price-error" message={errors?.exit_price} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                step="any"
                aria-invalid={Boolean(errors?.quantity)}
                aria-describedby={errors?.quantity ? "quantity-error" : undefined}
              />
              <FieldError id="quantity-error" message={errors?.quantity} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pnl">P/L</Label>
              <Input
                id="pnl"
                name="pnl"
                type="number"
                step="any"
                aria-invalid={Boolean(errors?.pnl)}
                aria-describedby={errors?.pnl ? "pnl-error" : undefined}
              />
              <FieldError id="pnl-error" message={errors?.pnl} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entry_time">Entry date &amp; time</Label>
            <Input
              id="entry_time"
              name="entry_time"
              type="datetime-local"
              required
              aria-invalid={Boolean(errors?.entry_time)}
              aria-describedby={errors?.entry_time ? "entry_time-error" : undefined}
            />
            <FieldError id="entry_time-error" message={errors?.entry_time} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} placeholder="What happened?" />
          </div>

          {state.error && !errors && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" variant="gold" disabled={pending}>
              {pending ? "Saving…" : "Save trade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
