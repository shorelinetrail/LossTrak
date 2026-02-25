// Supabase database schema type definitions

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
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          allowed_loss_types: string[];
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          allowed_loss_types?: string[];
          is_active?: boolean;
        };
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
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
        };
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
        Insert: {
          id?: string;
          subcategory_id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          subcategory_id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
        };
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
        Insert: {
          id?: string;
          date: string;
          production: number;
          bar: number;
          comments: string;
          status: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          production?: number;
          bar?: number;
          comments?: string;
          status?: string;
        };
      };
      loss_entries: {
        Row: {
          id: string;
          daily_log_id: string;
          date: string | null;
          category_id: string | null;
          subcategory_id: string | null;
          detail_code_id: string | null;
          loss_type: string;
          amount: number;
          comments: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          daily_log_id: string;
          date?: string | null;
          category_id?: string | null;
          subcategory_id?: string | null;
          detail_code_id?: string | null;
          loss_type: string;
          amount: number;
          comments: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          daily_log_id?: string;
          date?: string | null;
          category_id?: string | null;
          subcategory_id?: string | null;
          detail_code_id?: string | null;
          loss_type?: string;
          amount?: number;
          comments?: string;
        };
      };
      app_config: {
        Row: {
          id: string;
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: string;
        };
      };
    };
  };
}
