import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Ops views. Read with the service role deliberately: this is the internal
 * console and it must show EVERY tenant, which is the opposite of the RLS the
 * rest of the app relies on. Access is gated in the layout, not by RLS.
 */

export type PoolServer = {
  host: string;
  cores: number | null;
  ram_total_mb: number | null;
  ram_free_mb: number | null;
  disk_free_mb: number | null;
  load_1m: number | null;
  instances: number;
  capacity: number | null;
  image_tag: string | null;
  agent_version: string | null;
  last_seen_at: string;
};

export type OpsInstance = {
  account_id: string;
  email: string | null;
  mt5_login: string;
  mt5_server: string;
  server_host: string | null;
  desired_state: string;
  status: string;            // what the AGENT believes
  status_detail: string | null;
  cpu_cores: number | null;
  mem_mb: number | null;
  restarts: number;
  started_at: string | null;
  ea_version: string | null;
  ea_failed_fetches: number | null;
  ea_last_http_status: number | null;
  ea_queued_posts: number | null;
  ea_from_cache: boolean | null;
  eaLastSeenAt: string | null; // what the EA PROVES, from api_keys.last_used_at
};

export async function getPoolServers(): Promise<PoolServer[]> {
  const { data, error } = await createServiceClient()
    .from("pool_servers")
    .select("*")
    .order("host");
  if (error) throw new Error(error.message);
  return (data ?? []) as PoolServer[];
}

export async function getOpsInstances(): Promise<OpsInstance[]> {
  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from("mt5_instances")
    .select("*")
    .neq("desired_state", "removed")
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!rows?.length) return [];

  const accountIds = rows.map((r) => r.account_id);
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  // The EA's own heartbeat. This is the column that tells the truth: the agent
  // can believe a container is "running" long after its EA went silent, which
  // is exactly the shape of the weekend clock freeze.
  const [{ data: keys }, { data: profiles }] = await Promise.all([
    supabase
      .from("api_keys")
      .select("account_id, last_used_at")
      .in("account_id", accountIds)
      .is("revoked_at", null),
    supabase.from("profiles").select("id, email").in("id", userIds),
  ]);

  const lastSeen = new Map<string, string | null>();
  for (const k of keys ?? []) {
    const prev = lastSeen.get(k.account_id);
    if (!prev || (k.last_used_at && k.last_used_at > prev)) {
      lastSeen.set(k.account_id, k.last_used_at);
    }
  }
  const emails = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  return rows.map((r) => ({
    ...r,
    email: emails.get(r.user_id) ?? null,
    eaLastSeenAt: lastSeen.get(r.account_id) ?? null,
  })) as OpsInstance[];
}
