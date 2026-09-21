import "server-only";
import { cache } from "react";
import { getAccountContext } from "@/lib/data/context";
import { createServiceClient } from "@/lib/supabase/service";
import { getEaLastSeenAt } from "@/lib/data/_shared";
import { eaSeenWithin, EA_CONNECTED_WINDOW_MS } from "@/lib/ea-connection";

export type CloudEaStatus =
  | "off"
  | "starting"
  | "protected"
  | "reconnecting"
  | "login_failed"
  | "error"
  | "stopped";

export type CloudEa = {
  enabled: boolean;
  status: CloudEaStatus;
  detail: string | null;
  login: string | null;
  server: string | null;
  since: string | null;
  /** While starting: minutes since the request, and where it stands in line. */
  waitedMinutes?: number;
  queueAhead?: number;
  serversFull?: boolean;
};

/**
 * Where a waiting request stands. Needs the service role: other traders' rows
 * are invisible to this user, and only counts leave this function.
 */
async function queuePosition(since: string, accountId: string) {
  const svc = createServiceClient();
  const fresh = new Date(Date.now() - 5 * 60_000).toISOString();
  const [{ count }, { data: servers, error }] = await Promise.all([
    svc
      .from("mt5_instances")
      .select("account_id", { count: "exact", head: true })
      .eq("desired_state", "running")
      .in("status", ["pending", "provisioning"])
      .lt("updated_at", since)
      .neq("account_id", accountId),
    svc.from("pool_servers").select("instances, capacity").gte("last_seen_at", fresh),
  ]);
  // Full = live servers report in and none has a free place: the agent only
  // claims a waiting request when it has room. No report at all is not "full"
  // (the pool is quiet or the read failed) - the 10-minute message covers it.
  const live = error ? [] : (servers ?? []);
  const serversFull =
    live.length > 0 && !live.some((p) => p.capacity !== null && p.instances < p.capacity);
  return { queueAhead: count ?? 0, serversFull };
}

// The two cipher columns are withheld by column grant, so selecting them here
// would fail. Ask only for what the dashboard renders.
const STATUS_COLUMNS =
  "mt5_login, mt5_server, desired_state, status, status_detail, created_at, updated_at";

/**
 * Cloud protection status for the current account.
 *
 * The row's `status` says what the pool agent believes; the EA's own ping says
 * what is actually true. We trust the ping: a container the agent thinks is
 * "running" whose EA stopped reporting is shown as reconnecting, not healthy.
 */
export const getCloudEa = cache(async (): Promise<CloudEa> => {
  const { supabase, account } = await getAccountContext();

  const { data, error } = await supabase
    .from("mt5_instances")
    .select(STATUS_COLUMNS)
    .eq("account_id", account.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.desired_state === "removed") {
    return { enabled: false, status: "off", detail: null, login: null, server: null, since: null };
  }

  const base = {
    enabled: true,
    detail: data.status_detail,
    login: data.mt5_login,
    server: data.mt5_server,
    since: data.updated_at,
  };

  if (data.status === "login_failed") return { ...base, status: "login_failed" };
  if (data.status === "error") return { ...base, status: "error" };
  if (data.desired_state === "stopped" || data.status === "stopped") {
    return { ...base, status: "stopped" };
  }

  if (data.status === "running") {
    const lastSeenAt = await getEaLastSeenAt(supabase, account.id);
    return {
      ...base,
      status: eaSeenWithin(lastSeenAt, EA_CONNECTED_WINDOW_MS) ? "protected" : "reconnecting",
    };
  }

  // pending | provisioning
  const waitedMinutes = data.updated_at
    ? Math.max(0, Math.floor((Date.now() - Date.parse(data.updated_at)) / 60_000))
    : 0;
  const queue = data.updated_at
    ? await queuePosition(data.updated_at, account.id).catch(() => null)
    : null;
  return {
    ...base,
    status: "starting",
    waitedMinutes,
    queueAhead: queue?.queueAhead,
    // Once claimed ("provisioning") it has its place, however full the box is now.
    serversFull: data.status === "pending" && Boolean(queue?.serversFull),
  };
});
