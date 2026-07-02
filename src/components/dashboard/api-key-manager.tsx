"use client";

import { useOptimistic, useState, useTransition } from "react";
import { format } from "date-fns";
import { Copy, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { generateApiKeyAction, revokeApiKeyAction } from "@/lib/actions/api-keys";
import type { ApiKey } from "@/lib/data/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function ApiKeyManager({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  // Optimistically mark a key revoked while the server action is in flight;
  // reverts automatically if the action fails (setKeys is only called on success).
  const [optimisticKeys, revokeOptimistic] = useOptimistic(keys, (state, revokedId: string) =>
    state.map((k) => (k.id === revokedId ? { ...k, revoked_at: new Date().toISOString() } : k))
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateApiKeyAction(label);
      if (result.error || !result.rawKey || !result.key) {
        toast.error(result.error ?? "Couldn't generate key.");
        return;
      }
      setNewRawKey(result.rawKey);
      setKeys((prev) => [result.key!, ...prev]);
      setLabel("");
    });
  }

  function handleCopy() {
    if (!newRawKey) return;
    navigator.clipboard.writeText(newRawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeDialog() {
    setCreateOpen(false);
    setNewRawKey(null);
    setCopied(false);
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      revokeOptimistic(id);
      const result = await revokeApiKeyAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k))
      );
      toast.success("Key revoked.");
    });
  }

  return (
    <div>
      {optimisticKeys.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          No API keys yet. Generate one once your EA is ready to authenticate.
        </p>
      ) : (
        <div className="mb-4 space-y-2">
          {optimisticKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between rounded-md border border-border px-4 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">{key.label}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {key.key_prefix}••••••••
                  {" · created "}
                  {format(new Date(key.created_at), "MMM d, yyyy")}
                  {key.last_used_at ? ` · last used ${format(new Date(key.last_used_at), "MMM d")}` : ""}
                </p>
              </div>
              {key.revoked_at ? (
                <Badge variant="secondary">Revoked</Badge>
              ) : (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => handleRevoke(key.id)}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setCreateOpen(true);
        }}
      >
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Generate EA key
        </Button>
        <DialogContent>
          {newRawKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Save this key now</DialogTitle>
                <DialogDescription>
                  This is the only time it&apos;s shown. Paste it into your EA&apos;s configuration.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2">
                <code className="flex-1 truncate font-mono text-xs">{newRawKey}</code>
                <Button variant="ghost" size="icon" onClick={handleCopy}>
                  {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <DialogFooter>
                <Button variant="gold" onClick={closeDialog}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Generate a new EA key</DialogTitle>
                <DialogDescription>Name it so you remember which EA instance it belongs to.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="key-label">Label</Label>
                <Input
                  id="key-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. MT4 — FTMO Account"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="gold" onClick={handleGenerate} disabled={pending}>
                  {pending ? "Generating…" : "Generate key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
