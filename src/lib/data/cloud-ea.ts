import "server-only";
import { cache } from "react";
import { getAccountContext } from "@/lib/data/context";
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
};

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

  return { ...base, status: "starting" }; // pending | provisioning
});
