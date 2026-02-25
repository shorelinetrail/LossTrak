// Supabase database schema type definitions
// These mirror the Supabase generated types for when you connect a real instance

export interface Database {
  public: {
    Tables: {
      loss_categories: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          allowed_loss_types: string[];
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["loss_categories"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["loss_categories"]["Insert"]
        >;
      };
      loss_subcategories: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["loss_subcategories"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["loss_subcategories"]["Insert"]
        >;
      };
      loss_detail_codes: {
        Row: {
          id: string;
          subcategory_id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["loss_detail_codes"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["loss_detail_codes"]["Insert"]
        >;
      };
      daily_logs: {
        Row: {
          id: string;
          date: string;
          production: number;
          bar: number;
          delta: number;
          comments: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["daily_logs"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["daily_logs"]["Insert"]
        >;
      };
      loss_entries: {
        Row: {
          id: string;
          daily_log_id: string;
          category_id: string;
          subcategory_id: string;
          detail_code_id: string | null;
          loss_type: string;
          amount: number;
          comments: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["loss_entries"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["loss_entries"]["Insert"]
        >;
      };
      app_config: {
        Row: {
          id: string;
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["app_config"]["Row"],
          "id" | "updated_at"
        > & { id?: string; updated_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["app_config"]["Insert"]
        >;
      };
    };
  };
}
