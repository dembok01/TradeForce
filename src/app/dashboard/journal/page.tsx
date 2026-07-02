import { getTrades } from "@/lib/data/trades";
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
  const trades = await getTrades({
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Journal"
        title="Trade journal"
        description="Every trade, with room for the notes that explain it."
        action={<TradeFormDialog />}
      />

      <div className="mb-4">
        <DateRangeFilter />
      </div>

      <Card>
        <CardContent className="pt-6">
          <TradeTable trades={trades} />
        </CardContent>
      </Card>
    </div>
  );
}
