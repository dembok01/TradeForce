// Hand-written to match the files in supabase/migrations/.
// Once a real Supabase project is linked, regenerate with:
//   supabase gen types typescript --project-id <ref> --schema public > src/lib/supabase/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TradeDirection = "LONG" | "SHORT";
export type TradeSource = "MANUAL" | "EA";
export type ViolationType =
  | "OVERTRADING"
  | "OUTSIDE_SESSION"
  | "DAILY_LOSS_BREACH"
  | "OPEN_POSITIONS_BREACH"
  | "RISK_PER_TRADE_BREACH";
export type Mt5DesiredState = "running" | "stopped" | "removed";
export type Mt5InstanceStatus =
  | "pending"
  | "provisioning"
  | "running"
  | "stopped"
  | "login_failed"
  | "error"
  | "removed";

export type EaEventType = "EA_REMOVED" | "CONNECTION_LOST";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          timezone: string;
          onboarded_at: string | null;
          tour_completed_at: string | null;
          experience_level: string | null;
          markets_traded: string[] | null;
          prop_firm: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string; email: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          broker: string | null;
          starting_balance: number | null;
          current_equity: number | null;
          ea_trade_block: string | null;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["accounts"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Row"]>;
        Relationships: [];
      };
      trading_rules: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          daily_loss_limit: number | null;
          max_trades_per_day: number | null;
          max_open_positions: number | null;
          risk_per_trade_percent: number | null;
          session_london_enabled: boolean;
          session_new_york_enabled: boolean;
          session_asian_enabled: boolean;
          session_london_ny_overlap_enabled: boolean;
          custom_session_start: string | null;
          custom_session_end: string | null;
          timezone: string;
          is_active: boolean;
          config_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["trading_rules"]["Row"]> & {
          user_id: string;
          account_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["trading_rules"]["Row"]>;
        Relationships: [];
      };
      trades: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          symbol: string;
          direction: TradeDirection;
          entry_price: number;
          exit_price: number | null;
          quantity: number | null;
          pnl: number | null;
          entry_time: string;
          exit_time: string | null;
          notes: string | null;
          source: TradeSource;
          broker_deal_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["trades"]["Row"]> & {
          user_id: string;
          account_id: string;
          symbol: string;
          direction: TradeDirection;
          entry_price: number;
          entry_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["trades"]["Row"]>;
        Relationships: [];
      };
      violations: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          trade_id: string | null;
          type: ViolationType;
          details: Json;
          event_id: string | null;
          occurred_at: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["violations"]["Row"]> & {
          user_id: string;
          account_id: string;
          type: ViolationType;
        };
        Update: Partial<Database["public"]["Tables"]["violations"]["Row"]>;
        Relationships: [];
      };
      discipline_scores: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          score_date: string;
          rule_adherence_score: number;
          session_adherence_score: number;
          overtrading_prevention_score: number;
          risk_management_score: number;
          total_score: number;
          computed_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["discipline_scores"]["Row"]> & {
          user_id: string;
          account_id: string;
          score_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["discipline_scores"]["Row"]>;
        Relationships: [];
      };
      account_snapshots: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          equity: number;
          balance: number | null;
          recorded_at: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["account_snapshots"]["Row"]> & {
          user_id: string;
          account_id: string;
          equity: number;
        };
        Update: Partial<Database["public"]["Tables"]["account_snapshots"]["Row"]>;
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          label: string;
          key_prefix: string;
          key_hash: string;
          last_used_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["api_keys"]["Row"]> & {
          user_id: string;
          account_id: string;
          key_prefix: string;
          key_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["api_keys"]["Row"]>;
        Relationships: [];
      };
      pool_servers: {
        Row: {
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
        Insert: Partial<Database["public"]["Tables"]["pool_servers"]["Row"]> & { host: string };
        Update: Partial<Database["public"]["Tables"]["pool_servers"]["Row"]>;
        Relationships: [];
      };
      mt5_instances: {
        Row: {
          account_id: string;
          user_id: string;
          mt5_login: string;
          mt5_server: string;
          mt5_password_cipher: string;
          ea_key_cipher: string;
          api_key_id: string | null;
          server_host: string | null;
          desired_state: Mt5DesiredState;
          status: Mt5InstanceStatus;
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
          ea_backoff_seconds: number | null;
          ea_reported_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["mt5_instances"]["Row"]> & {
          account_id: string;
          user_id: string;
          mt5_login: string;
          mt5_server: string;
          mt5_password_cipher: string;
          ea_key_cipher: string;
        };
        Update: Partial<Database["public"]["Tables"]["mt5_instances"]["Row"]>;
        Relationships: [];
      };
      ea_events: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          event_type: EaEventType;
          details: Json;
          occurred_at: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ea_events"]["Row"]> & {
          user_id: string;
          account_id: string;
          event_type: EaEventType;
        };
        Update: Partial<Database["public"]["Tables"]["ea_events"]["Row"]>;
        Relationships: [];
      };
      contact_messages: {
        Row: {
          id: string;
          name: string;
          email: string;
          message: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["contact_messages"]["Row"]> & {
          name: string;
          email: string;
          message: string;
        };
        Update: Partial<Database["public"]["Tables"]["contact_messages"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      trades_pnl_buckets: {
        Args: { p_account_id: string; p_tz: string };
        Returns: {
          kind: string;
          bucket_date: string;
          pnl: number;
          trade_count: number;
          win_count: number;
        }[];
      };
      equity_sparkline: {
        Args: { p_account_id: string; p_hours?: number; p_buckets?: number };
        Returns: { bucket_start: string; equity: number }[];
      };
      ea_outages: {
        Args: { p_account_id: string; p_since?: string; p_min_minutes?: number };
        Returns: { started_at: string; ended_at: string; minutes: number }[];
      };
      ea_outages_all: {
        Args: { p_since?: string; p_min_minutes?: number };
        Returns: { account_id: string; started_at: string; ended_at: string; minutes: number }[];
      };
      ea_uptime_pct: {
        Args: { p_account_id: string; p_since?: string; p_min_minutes?: number };
        Returns: number;
      };
    };
    Enums: {
      trade_direction: TradeDirection;
      trade_source: TradeSource;
      violation_type: ViolationType;
    };
    CompositeTypes: Record<string, never>;
  };
}
