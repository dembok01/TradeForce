import { getTrades } from "@/lib/data/trades";
import { getEaConnection } from "@/lib/data/api-keys";
import { PageHeader } from "@/components/dashboard/page-header";
import { TradeFormDialog } from "@/components/dashboard/trade-form-dialog";
import { TradeTable } from "@/components/dashboard/trade-table";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Card, CardContent } from "@/components/ui/card";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const [trades, eaConnection] = await Promise.all([
    getTrades({
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    }),
    getEaConnection(),
  ]);
  const { manualEntryLocked } = eaConnection;

  return (
    <div>
      <PageHeader
        eyebrow="Journal"
        title="Trade journal"
        description={
          manualEntryLocked
            ? "Your EA is reporting trades automatically — manual entry is off so the record stays verified."
            : "Every trade, with room for the notes that explain it."
        }
        action={manualEntryLocked ? undefined : <TradeFormDialog />}
      />

      <div className="mb-4">
        <DateRangeFilter />
      </div>

      <Card>
        <CardContent className="pt-6">
          <TradeTable trades={trades} manualEntryLocked={manualEntryLocked} />
        </CardContent>
      </Card>
    </div>
  );
}
