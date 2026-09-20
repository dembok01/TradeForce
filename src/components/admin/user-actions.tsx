"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adminDeleteUserAction,
  adminDisableCloudEaAction,
  adminRevokeKeysAction,
} from "@/lib/actions/admin";

/**
 * Destructive operations, gated the way an operator can live with: deleting
 * asks for the email to be typed out, because the row above and the row below
 * look identical at a glance.
 */
export function UserActions({
  userId,
  email,
  accountId,
  hasCloud,
  hasKeys,
}: {
  userId: string;
  email: string;
  accountId: string | null;
  hasCloud: boolean;
  hasKeys: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  function run(fn: () => Promise<{ ok?: true; pending?: string; error?: string }>, done: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.pending) toast.info(r.pending);
      else toast.success(done);
      setConfirming(false);
      setTyped("");
      router.refresh();
    });
  }

  const btn =
    "rounded border px-2 py-1 text-xs whitespace-nowrap disabled:opacity-50 hover:bg-muted/60";

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={`Type ${email} to confirm deletion`}
          className="w-52 rounded border bg-background px-2 py-1 text-xs"
          placeholder={`Type ${email}`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button
          className={`${btn} border-red-500/50 text-red-500`}
          disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}
          onClick={() => run(() => adminDeleteUserAction(userId), "User deleted.")}
        >
          {pending ? "Deleting…" : "Confirm delete"}
        </button>
        <button className={btn} disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {hasCloud && accountId ? (
        <button
          className={btn}
          disabled={pending}
          onClick={() => run(() => adminDisableCloudEaAction(accountId), "Cloud terminal stopping.")}
        >
          Stop cloud
        </button>
      ) : null}
      {hasKeys ? (
        <button
          className={btn}
          disabled={pending}
          onClick={() => run(() => adminRevokeKeysAction(userId), "Keys revoked.")}
        >
          Revoke keys
        </button>
      ) : null}
      <button
        className={`${btn} border-red-500/40 text-red-500`}
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
    </div>
  );
}
