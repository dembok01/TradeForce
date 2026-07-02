// Hand-written to match supabase/migrations/20260702000000_init_schema.sql.
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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          timezone: string;
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
    Functions: Record<string, never>;
    Enums: {
      trade_direction: TradeDirection;
      trade_source: TradeSource;
      violation_type: ViolationType;
    };
    CompositeTypes: Record<string, never>;
  };
}
