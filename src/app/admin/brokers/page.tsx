import { getBrokerRows, getDiscoveredServers, getLatestProbes } from "@/lib/data/brokers";
import { BrokerAdmin } from "@/components/admin/broker-admin";

export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  const [rows, discovered, probes] = await Promise.all([
    getBrokerRows(),
    getDiscoveredServers(),
    getLatestProbes(),
  ]);

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
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          <strong>Check it answers</strong> before you trust an address. A pool box runs a real
          terminal against it with a login that was never valid — being refused proves a MetaTrader
          server is there. It takes a minute or two, and it is the only test that works: both
          <code className="mx-1 font-mono text-xs">mt5.roboforex.com:443</code> and
          <code className="mx-1 font-mono text-xs">mt5.xm.com:443</code> accept connections and
          neither is an MT5 server.
        </p>
      </div>

      <BrokerAdmin rows={rows} discovered={discovered} probes={probes} />
    </div>
  );
}
