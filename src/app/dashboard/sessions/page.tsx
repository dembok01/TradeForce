import { getTradingPlanStatus } from "@/lib/data/trading-plan";
import { PageHeader } from "@/components/dashboard/page-header";
import { SessionControlForm } from "@/components/dashboard/session-control-form";

export default async function SessionsPage() {
  const { rules } = await getTradingPlanStatus();

  return (
    <div>
      <PageHeader
        eyebrow="Sessions"
        title="Session control"
        description="Restrict enforcement to specific trading hours. Outside an allowed window, opening a position counts as a violation."
      />
      <SessionControlForm rules={rules} />
    </div>
  );
}
