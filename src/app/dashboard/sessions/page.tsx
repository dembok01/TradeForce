import { getTradingPlanStatus } from "@/lib/data/trading-plan";
import { PageHeader } from "@/components/dashboard/page-header";
import { SessionControlForm } from "@/components/dashboard/session-control-form";
import { Reveal } from "@/components/motion/reveal";

export default async function SessionsPage() {
  const { rules, sessions } = await getTradingPlanStatus();

  return (
    <div>
      <PageHeader
        eyebrow="Sessions"
        title="Session control"
        description="Restrict enforcement to specific trading hours. Outside an allowed window, opening a position counts as a violation."
      />
      <Reveal delay={0.05}>
        <SessionControlForm rules={rules} sessions={sessions} />
      </Reveal>
    </div>
  );
}
