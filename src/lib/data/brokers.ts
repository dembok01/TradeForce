import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { exnessServers, type Mt5Server } from "@/lib/mt5-brokers";
import { log } from "@/lib/log";

/**
 * The broker catalogue, read from mt5_brokers instead of a hardcoded array, so
 * adding a broker is an admin action rather than a deploy.
 *
 * Read with the service role: the catalogue is the same for every tenant, and
 * the picker has to render for a trader whose session RLS would otherwise have
 * to be threaded through every caller.
 */

export type BrokerRow = Mt5Server & {
  id: number;
  enabled: boolean;
  verified_at: string | null;
  verified_server: string | null;
  source: "seed" | "admin" | "trader";
  note: string | null;
  updated_at: string;
};

const PICKER_COLUMNS = "broker,label,address,kind,help";
const ADMIN_COLUMNS =
  "id,broker,label,address,kind,help,enabled,verified_at,verified_server,source,note,updated_at";

/** What the picker offers: enabled rows, plus Exness's generated servers. */
export const getPickerServers = cache(async (): Promise<Mt5Server[]> => {
  const { data, error } = await createServiceClient()
    .from("mt5_brokers")
    .select(PICKER_COLUMNS)
    .eq("enabled", true)
    .order("broker")
    .order("label");

  if (error) {
    // Losing the catalogue must not take the Connect form down. A trader can
    // still type their own address, which is how most of the world's brokers
    // are reached anyway, so degrade to the generated Exness entries.
    //
    // The likeliest cause by far is deploying ahead of the migration, so say so:
    // the picker goes nearly empty and the reason is not otherwise obvious.
    log.error("broker catalogue unavailable - picker will be almost empty", {
      detail: `${error.message} (is 20260930000000_mt5_brokers.sql applied?)`,
    });
    return exnessServers();
  }
  return [...((data ?? []) as Mt5Server[]), ...exnessServers()];
});

/** Everything, including what is disabled: the admin console's view. */
export async function getBrokerRows(): Promise<BrokerRow[]> {
  const { data, error } = await createServiceClient()
    .from("mt5_brokers")
    .select(ADMIN_COLUMNS)
    .order("broker")
    .order("label");
  if (error) {
    log.error("broker rows unavailable", { detail: error.message });
    return [];
  }
  return (data ?? []) as BrokerRow[];
}

export type DiscoveredServer = {
  address: string;
  /** The name the broker itself reported, e.g. "Alpari-MT5-Demo". */
  server: string | null;
  /** How many accounts have signed in through this address. */
  accounts: number;
  lastSeen: string;
};

const CONNECTED = "Connected to ";

/**
 * Addresses traders have actually signed in through that the catalogue is
 * missing.
 *
 * This is the one source that needs no verifying: the agent only writes
 * "Connected to <server>" after MetaTrader reported `authorized on <server>`,
 * so every row here is an address a real broker answered on, and it carries the
 * server name the broker gave itself. Someone typing their own address is how a
 * broker we do not list first appears - this turns that into a catalogue entry
 * instead of leaving it in one trader's row.
 */
export async function getDiscoveredServers(): Promise<DiscoveredServer[]> {
  const db = createServiceClient();
  const [instances, known] = await Promise.all([
    db
      .from("mt5_instances")
      .select("mt5_server,status_detail,updated_at")
      .like("status_detail", `${CONNECTED}%`),
    db.from("mt5_brokers").select("address"),
  ]);

  if (instances.error || known.error) {
    log.error("discovered servers unavailable", {
      detail: instances.error?.message ?? known.error?.message,
    });
    return [];
  }

  return discoverFrom(
    (instances.data ?? []) as SignedInRow[],
    ((known.data ?? []) as { address: string }[]).map((r) => r.address),
  );
}

export type SignedInRow = {
  mt5_server: string;
  status_detail: string | null;
  updated_at: string;
};

/**
 * Group the sign-ins into one row per address the catalogue is missing.
 *
 * Separated from the query so the part that can actually be wrong - dropping
 * what we already list, counting accounts, keeping the newest sighting - is
 * testable without a database.
 */
export function discoverFrom(rows: SignedInRow[], catalogued: string[]): DiscoveredServer[] {
  const known = new Set(catalogued);
  const found = new Map<string, DiscoveredServer>();

  for (const row of rows) {
    const address = row.mt5_server?.trim();
    if (!address || known.has(address)) continue;
    if (!row.status_detail?.startsWith(CONNECTED)) continue;
    const server = row.status_detail.slice(CONNECTED.length).trim() || null;
    const seen = found.get(address);
    if (seen) {
      seen.accounts += 1;
      if (row.updated_at > seen.lastSeen) seen.lastSeen = row.updated_at;
      seen.server ??= server;
    } else {
      found.set(address, { address, server, accounts: 1, lastSeen: row.updated_at });
    }
  }

  return [...found.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export type Probe = {
  address: string;
  status: "queued" | "running" | "done";
  result: "reached" | "not_reached" | "error" | null;
  evidence: string | null;
  requested_at: string;
};

/**
 * The most recent verification per address.
 *
 * Only a pool box can run one - it takes a real terminal about ninety seconds -
 * so the console shows the last answer rather than asking on page load.
 */
export async function getLatestProbes(): Promise<Probe[]> {
  const { data, error } = await createServiceClient()
    .from("broker_probes")
    .select("address,status,result,evidence,requested_at")
    .order("requested_at", { ascending: false })
    .limit(200);
  if (error) {
    log.error("broker probes unavailable", { detail: error.message });
    return [];
  }
  // Newest first, so the first sighting of an address is its latest answer.
  // Returned as a list rather than a Map: this crosses into a client component.
  const latest = new Map<string, Probe>();
  for (const row of (data ?? []) as Probe[]) {
    if (!latest.has(row.address)) latest.set(row.address, row);
  }
  return [...latest.values()];
}
