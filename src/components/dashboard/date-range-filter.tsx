"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  function update(key: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="from" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input id="from" type="date" value={from} onChange={(e) => update("from", e.target.value)} className="h-8" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="to" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input id="to" type="date" value={to} onChange={(e) => update("to", e.target.value)} className="h-8" />
      </div>
      {(from || to) && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          Clear
        </Button>
      )}
    </div>
  );
}
