import { getBrokerRows, getDiscoveredServers } from "@/lib/data/brokers";
import { BrokerAdmin } from "@/components/admin/broker-admin";

export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  const [rows, discovered] = await Promise.all([getBrokerRows(), getDiscoveredServers()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Brokers</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          What the &ldquo;Connect your account&rdquo; picker offers. Adding one here puts it in front
          of traders immediately — no deploy.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          It has to be an <strong>address</strong> like{" "}
          <code className="font-mono text-xs">mt5-demo.icmarkets.com:443</code>, not a server name
          like <code className="font-mono text-xs">ICMarketsSC-Demo</code>. MetaTrader only resolves
          a name it already carries in its own directory, and ours holds just MetaQuotes and Exness —
          a name saved here would never connect for anyone. A broker&rsquo;s support will give you
          the address; the trader can also read it from their own MetaTrader, under Journal.
        </p>
      </div>

      <BrokerAdmin rows={rows} discovered={discovered} />
    </div>
  );
}
