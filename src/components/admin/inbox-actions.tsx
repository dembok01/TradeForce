"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminHandleConnectionAction, adminSetHandledAction } from "@/lib/actions/admin";

export function HandledButton({ id, handled }: { id: string; handled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="rounded border px-2 py-1 text-xs whitespace-nowrap disabled:opacity-50 hover:bg-muted/60"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await adminSetHandledAction(id, !handled);
          if (r.error) toast.error(r.error);
          router.refresh();
        })
      }
    >
      {pending ? "…" : handled ? "Reopen" : "Mark handled"}
    </button>
  );
}

export function ConnectionHandledButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="rounded border px-2 py-1 text-xs whitespace-nowrap disabled:opacity-50 hover:bg-muted/60"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await adminHandleConnectionAction(accountId);
          if (r.error) toast.error(r.error);
          router.refresh();
        })
      }
    >
      {pending ? "…" : "Mark handled"}
    </button>
  );
}
