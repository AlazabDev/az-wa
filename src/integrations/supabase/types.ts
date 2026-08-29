export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          acknowledged_at: string | null
          alert_type: string
          business_portfolio_id: string | null
          created_at: string
          details: Json
          id: string
          message: string | null
          organization_id: string
          resolved_at: string | null
          severity: string
          source_entity_id: string | null
          source_entity_type: string | null
          status: string
          title: string
          updated_at: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          alert_type: string
          business_portfolio_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          message?: string | null
          organization_id: string
          resolved_at?: string | null
          severity: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          title: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          alert_type?: string
          business_portfolio_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          message?: string | null
          organization_id?: string
          resolved_at?: string | null
          severity?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          title?: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "alerts_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "alerts_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "alerts_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "alerts_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      api_errors: {
        Row: {
          api_request_id: string | null
          created_at: string
          error_code: string | null
          error_type: string | null
          first_occurred_at: string
          id: string
          last_occurred_at: string
          message: string | null
          occurrence_count: number
          organization_id: string
          raw_error: Json
          resolved_at: string | null
          status: string
          title: string | null
          updated_at: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          api_request_id?: string | null
          created_at?: string
          error_code?: string | null
          error_type?: string | null
          first_occurred_at?: string
          id?: string
          last_occurred_at?: string
          message?: string | null
          occurrence_count?: number
          organization_id: string
          raw_error?: Json
          resolved_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          api_request_id?: string | null
          created_at?: string
          error_code?: string | null
          error_type?: string | null
          first_occurred_at?: string
          id?: string
          last_occurred_at?: string
          message?: string | null
          occurrence_count?: number
          organization_id?: string
          raw_error?: Json
          resolved_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_errors_api_request_id_fkey"
            columns: ["api_request_id"]
            isOneToOne: false
            referencedRelation: "api_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_errors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_errors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "api_errors_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "api_errors_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_errors_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "api_errors_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "api_errors_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      api_requests: {
        Row: {
          business_portfolio_id: string | null
          correlation_id: string | null
          created_at: string
          duration_ms: number | null
          endpoint: string
          http_status: number | null
          id: string
          meta_app_id: string | null
          meta_error_code: string | null
          meta_error_message: string | null
          method: string
          organization_id: string
          request_id: string | null
          request_meta: Json
          response_meta: Json
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          business_portfolio_id?: string | null
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          http_status?: number | null
          id?: string
          meta_app_id?: string | null
          meta_error_code?: string | null
          meta_error_message?: string | null
          method: string
          organization_id: string
          request_id?: string | null
          request_meta?: Json
          response_meta?: Json
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          business_portfolio_id?: string | null
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          http_status?: number | null
          id?: string
          meta_app_id?: string | null
          meta_error_code?: string | null
          meta_error_message?: string | null
          method?: string
          organization_id?: string
          request_id?: string | null
          request_meta?: Json
          response_meta?: Json
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_requests_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_requests_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "api_requests_meta_app_id_fkey"
            columns: ["meta_app_id"]
            isOneToOne: false
            referencedRelation: "meta_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "api_requests_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "api_requests_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_requests_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "api_requests_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "api_requests_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          business_portfolio_id: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          user_agent: string | null
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          business_portfolio_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          user_agent?: string | null
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          business_portfolio_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          user_agent?: string | null
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "audit_logs_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "audit_logs_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "audit_logs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "audit_logs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          organization_id: string
          priority: number
          scope_business_portfolio_id: string | null
          scope_waba_id: string | null
          scope_whatsapp_number_id: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          organization_id: string
          priority?: number
          scope_business_portfolio_id?: string | null
          scope_waba_id?: string | null
          scope_whatsapp_number_id?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          organization_id?: string
          priority?: number
          scope_business_portfolio_id?: string | null
          scope_waba_id?: string | null
          scope_whatsapp_number_id?: string | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "automation_rules_scope_business_portfolio_id_fkey"
            columns: ["scope_business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_scope_business_portfolio_id_fkey"
            columns: ["scope_business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "automation_rules_scope_waba_id_fkey"
            columns: ["scope_waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "automation_rules_scope_waba_id_fkey"
            columns: ["scope_waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_scope_whatsapp_number_id_fkey"
            columns: ["scope_whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "automation_rules_scope_whatsapp_number_id_fkey"
            columns: ["scope_whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "automation_rules_scope_whatsapp_number_id_fkey"
            columns: ["scope_whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          automation_rule_id: string
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          input_payload: Json
          message_id: string | null
          organization_id: string
          output_payload: Json
          started_at: string | null
          status: string
          trigger_event_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          automation_rule_id: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_payload?: Json
          message_id?: string | null
          organization_id: string
          output_payload?: Json
          started_at?: string | null
          status?: string
          trigger_event_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          automation_rule_id?: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_payload?: Json
          message_id?: string | null
          organization_id?: string
          output_payload?: Json
          started_at?: string | null
          status?: string
          trigger_event_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_rule_id_fkey"
            columns: ["automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "automation_runs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "automation_runs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "automation_runs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      business_portfolios: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          last_synced_at: string | null
          meta_business_id: string
          metadata: Json
          name: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          meta_business_id: string
          metadata?: Json
          name?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          meta_business_id?: string
          metadata?: Json
          name?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_portfolios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_portfolios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          contact_channel_id: string | null
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          message_id: string | null
          organization_id: string
          queued_at: string
          read_at: string | null
          recipient_address: string
          sent_at: string | null
          status: string
          template_variables: Json
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contact_channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          message_id?: string | null
          organization_id: string
          queued_at?: string
          read_at?: string | null
          recipient_address: string
          sent_at?: string | null
          status?: string
          template_variables?: Json
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contact_channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          message_id?: string | null
          organization_id?: string
          queued_at?: string
          read_at?: string | null
          recipient_address?: string
          sent_at?: string | null
          status?: string
          template_variables?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_channel_id_fkey"
            columns: ["contact_channel_id"]
            isOneToOne: false
            referencedRelation: "contact_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          scheduled_at: string | null
          sender_whatsapp_number_id: string
          started_at: string | null
          stats: Json
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          audience_filter?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          scheduled_at?: string | null
          sender_whatsapp_number_id: string
          started_at?: string | null
          stats?: Json
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          audience_filter?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          scheduled_at?: string | null
          sender_whatsapp_number_id?: string
          started_at?: string | null
          stats?: Json
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "campaigns_sender_whatsapp_number_id_fkey"
            columns: ["sender_whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "campaigns_sender_whatsapp_number_id_fkey"
            columns: ["sender_whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "campaigns_sender_whatsapp_number_id_fkey"
            columns: ["sender_whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_channels: {
        Row: {
          address: string
          channel_type: string
          contact_id: string
          created_at: string
          id: string
          is_primary: boolean
          metadata: Json
          normalized_address: string | null
          organization_id: string
          profile_name: string | null
          updated_at: string
          wa_id: string | null
        }
        Insert: {
          address: string
          channel_type?: string
          contact_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          metadata?: Json
          normalized_address?: string | null
          organization_id: string
          profile_name?: string | null
          updated_at?: string
          wa_id?: string | null
        }
        Update: {
          address?: string
          channel_type?: string
          contact_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          metadata?: Json
          normalized_address?: string | null
          organization_id?: string
          profile_name?: string | null
          updated_at?: string
          wa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_channels_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      contact_consents: {
        Row: {
          consent_type: string
          contact_id: string
          created_at: string
          effective_at: string
          evidence: Json
          id: string
          organization_id: string
          source: string | null
          status: string
          whatsapp_number_id: string | null
        }
        Insert: {
          consent_type: string
          contact_id: string
          created_at?: string
          effective_at?: string
          evidence?: Json
          id?: string
          organization_id: string
          source?: string | null
          status: string
          whatsapp_number_id?: string | null
        }
        Update: {
          consent_type?: string
          contact_id?: string
          created_at?: string
          effective_at?: string
          evidence?: Json
          id?: string
          organization_id?: string
          source?: string | null
          status?: string
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "contact_consents_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "contact_consents_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "contact_consents_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          assigned_team_id: string | null
          assigned_user_id: string | null
          company: string | null
          created_at: string
          custom_fields: Json
          display_name: string | null
          email: string | null
          first_interaction_at: string | null
          first_name: string | null
          id: string
          last_interaction_at: string | null
          last_name: string | null
          notes: string | null
          organization_id: string
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_team_id?: string | null
          assigned_user_id?: string | null
          company?: string | null
          created_at?: string
          custom_fields?: Json
          display_name?: string | null
          email?: string | null
          first_interaction_at?: string | null
          first_name?: string | null
          id?: string
          last_interaction_at?: string | null
          last_name?: string | null
          notes?: string | null
          organization_id: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_team_id?: string | null
          assigned_user_id?: string | null
          company?: string | null
          created_at?: string
          custom_fields?: Json
          display_name?: string | null
          email?: string | null
          first_interaction_at?: string | null
          first_name?: string | null
          id?: string
          last_interaction_at?: string | null
          last_name?: string | null
          notes?: string | null
          organization_id?: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      conversation_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assigned_team_id: string | null
          assigned_user_id: string | null
          conversation_id: string
          ended_at: string | null
          id: string
          organization_id: string
          reason: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_team_id?: string | null
          assigned_user_id?: string | null
          conversation_id: string
          ended_at?: string | null
          id?: string
          organization_id: string
          reason?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_team_id?: string | null
          assigned_user_id?: string | null
          conversation_id?: string
          ended_at?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      conversation_notes: {
        Row: {
          author_user_id: string
          body: string
          conversation_id: string
          created_at: string
          id: string
          is_pinned: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_team_id: string | null
          assigned_user_id: string | null
          category: string | null
          closed_at: string | null
          contact_channel_id: string | null
          contact_id: string
          created_at: string
          id: string
          last_incoming_at: string | null
          last_message_at: string | null
          last_outgoing_at: string | null
          meta_conversation_id: string | null
          metadata: Json
          opened_at: string
          organization_id: string
          priority: string
          resolved_at: string | null
          status: string
          unread_count: number
          updated_at: string
          whatsapp_number_id: string
        }
        Insert: {
          assigned_team_id?: string | null
          assigned_user_id?: string | null
          category?: string | null
          closed_at?: string | null
          contact_channel_id?: string | null
          contact_id: string
          created_at?: string
          id?: string
          last_incoming_at?: string | null
          last_message_at?: string | null
          last_outgoing_at?: string | null
          meta_conversation_id?: string | null
          metadata?: Json
          opened_at?: string
          organization_id: string
          priority?: string
          resolved_at?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
          whatsapp_number_id: string
        }
        Update: {
          assigned_team_id?: string | null
          assigned_user_id?: string | null
          category?: string | null
          closed_at?: string | null
          contact_channel_id?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          last_incoming_at?: string | null
          last_message_at?: string | null
          last_outgoing_at?: string | null
          meta_conversation_id?: string | null
          metadata?: Json
          opened_at?: string
          organization_id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_channel_id_fkey"
            columns: ["contact_channel_id"]
            isOneToOne: false
            referencedRelation: "contact_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_letter_jobs: {
        Row: {
          attempts: number
          created_at: string
          failed_at: string
          id: string
          job_type: string
          last_error: string | null
          organization_id: string
          original_job_id: string | null
          payload: Json
          queue_name: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          failed_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          organization_id: string
          original_job_id?: string | null
          payload: Json
          queue_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          failed_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          organization_id?: string
          original_job_id?: string | null
          payload?: Json
          queue_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dead_letter_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dead_letter_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "dead_letter_jobs_original_job_id_fkey"
            columns: ["original_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      health_checks: {
        Row: {
          business_portfolio_id: string | null
          checked_at: string
          component: string
          created_at: string
          details: Json
          id: string
          message: string | null
          organization_id: string
          score: number | null
          status: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          business_portfolio_id?: string | null
          checked_at?: string
          component: string
          created_at?: string
          details?: Json
          id?: string
          message?: string | null
          organization_id: string
          score?: number | null
          status: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          business_portfolio_id?: string | null
          checked_at?: string
          component?: string
          created_at?: string
          details?: Json
          id?: string
          message?: string | null
          organization_id?: string
          score?: number | null
          status?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_checks_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_checks_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "health_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "health_checks_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "health_checks_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_checks_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "health_checks_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "health_checks_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          integration_type: string
          last_failure_at: string | null
          last_success_at: string | null
          name: string
          organization_id: string
          secret_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          integration_type: string
          last_failure_at?: string | null
          last_success_at?: string | null
          name: string
          organization_id: string
          secret_reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          integration_type?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          name?: string
          organization_id?: string
          secret_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempt: number
          available_at: string
          completed_at: string | null
          created_at: string
          deduplication_key: string | null
          error: string | null
          failed_at: string | null
          id: string
          job_type: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          organization_id: string
          payload: Json
          priority: number
          queue_name: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          deduplication_key?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          job_type: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          organization_id: string
          payload?: Json
          priority?: number
          queue_name: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          deduplication_key?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          job_type?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          organization_id?: string
          payload?: Json
          priority?: number
          queue_name?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      media: {
        Row: {
          contact_id: string | null
          created_at: string
          download_attempts: number
          download_status: string
          file_size: number | null
          filename: string | null
          id: string
          last_error: string | null
          media_type: string
          message_id: string
          meta_media_id: string | null
          metadata: Json
          mime_type: string | null
          organization_id: string
          received_at: string | null
          sha256: string | null
          storage_bucket: string
          storage_path: string | null
          storage_provider: string
          stored_at: string | null
          updated_at: string
          whatsapp_number_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          download_attempts?: number
          download_status?: string
          file_size?: number | null
          filename?: string | null
          id?: string
          last_error?: string | null
          media_type: string
          message_id: string
          meta_media_id?: string | null
          metadata?: Json
          mime_type?: string | null
          organization_id: string
          received_at?: string | null
          sha256?: string | null
          storage_bucket?: string
          storage_path?: string | null
          storage_provider?: string
          stored_at?: string | null
          updated_at?: string
          whatsapp_number_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          download_attempts?: number
          download_status?: string
          file_size?: number | null
          filename?: string | null
          id?: string
          last_error?: string | null
          media_type?: string
          message_id?: string
          meta_media_id?: string | null
          metadata?: Json
          mime_type?: string | null
          organization_id?: string
          received_at?: string | null
          sha256?: string | null
          storage_bucket?: string
          storage_path?: string | null
          storage_provider?: string
          stored_at?: string | null
          updated_at?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "media_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "media_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "media_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      media_download_attempts: {
        Row: {
          attempt_no: number
          completed_at: string | null
          error: string | null
          http_status: number | null
          id: string
          media_id: string
          organization_id: string
          started_at: string
          status: string
        }
        Insert: {
          attempt_no: number
          completed_at?: string | null
          error?: string | null
          http_status?: number | null
          id?: string
          media_id: string
          organization_id: string
          started_at?: string
          status: string
        }
        Update: {
          attempt_no?: number
          completed_at?: string | null
          error?: string | null
          http_status?: number | null
          id?: string
          media_id?: string
          organization_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_download_attempts_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_download_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_download_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      message_outbox: {
        Row: {
          attempt_count: number
          campaign_id: string | null
          campaign_recipient_id: string | null
          completed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          message_type: string
          meta_message_id: string | null
          next_attempt_at: string
          organization_id: string
          recipient_address: string
          request_payload: Json
          requested_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          whatsapp_number_id: string
        }
        Insert: {
          attempt_count?: number
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          message_type: string
          meta_message_id?: string | null
          next_attempt_at?: string
          organization_id: string
          recipient_address: string
          request_payload: Json
          requested_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          whatsapp_number_id: string
        }
        Update: {
          attempt_count?: number
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          message_type?: string
          meta_message_id?: string | null
          next_attempt_at?: string
          organization_id?: string
          recipient_address?: string
          request_payload?: Json
          requested_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_outbox_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_campaign_recipient_id_fkey"
            columns: ["campaign_recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "message_outbox_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "message_outbox_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "message_outbox_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_send_attempts: {
        Row: {
          api_request_id: string | null
          attempt_no: number
          created_at: string
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string
          organization_id: string
          outbox_id: string
          response_meta: Json
          status: string
        }
        Insert: {
          api_request_id?: string | null
          attempt_no: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          organization_id: string
          outbox_id: string
          response_meta?: Json
          status: string
        }
        Update: {
          api_request_id?: string | null
          attempt_no?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          organization_id?: string
          outbox_id?: string
          response_meta?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_send_attempts_api_request_id_fkey"
            columns: ["api_request_id"]
            isOneToOne: false
            referencedRelation: "api_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_send_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_send_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "message_send_attempts_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "message_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      message_status_history: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          message_id: string
          meta_timestamp: string | null
          organization_id: string
          raw_payload: Json
          status: string
          whatsapp_number_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_id: string
          meta_timestamp?: string | null
          organization_id: string
          raw_payload?: Json
          status: string
          whatsapp_number_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_id?: string
          meta_timestamp?: string | null
          organization_id?: string
          raw_payload?: Json
          status?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_status_history_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "message_status_history_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "message_status_history_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "message_status_history_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          caption: string | null
          contact_channel_id: string | null
          contact_id: string | null
          context_payload: Json
          conversation_id: string | null
          created_at: string
          direction: string
          id: string
          interactive_payload: Json
          message_type: string
          meta_message_id: string | null
          meta_reply_to_message_id: string | null
          meta_timestamp: string | null
          organization_id: string
          raw_payload: Json
          received_at: string | null
          reply_to_message_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
          whatsapp_number_id: string
        }
        Insert: {
          body?: string | null
          caption?: string | null
          contact_channel_id?: string | null
          contact_id?: string | null
          context_payload?: Json
          conversation_id?: string | null
          created_at?: string
          direction: string
          id?: string
          interactive_payload?: Json
          message_type: string
          meta_message_id?: string | null
          meta_reply_to_message_id?: string | null
          meta_timestamp?: string | null
          organization_id: string
          raw_payload?: Json
          received_at?: string | null
          reply_to_message_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_number_id: string
        }
        Update: {
          body?: string | null
          caption?: string | null
          contact_channel_id?: string | null
          contact_id?: string | null
          context_payload?: Json
          conversation_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          interactive_payload?: Json
          message_type?: string
          meta_message_id?: string | null
          meta_reply_to_message_id?: string | null
          meta_timestamp?: string | null
          organization_id?: string
          raw_payload?: Json
          received_at?: string | null
          reply_to_message_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_channel_id_fkey"
            columns: ["contact_channel_id"]
            isOneToOne: false
            referencedRelation: "contact_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "messages_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "messages_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_app_wabas: {
        Row: {
          created_at: string
          meta_app_id: string
          status: string
          updated_at: string
          waba_id: string
        }
        Insert: {
          created_at?: string
          meta_app_id: string
          status?: string
          updated_at?: string
          waba_id: string
        }
        Update: {
          created_at?: string
          meta_app_id?: string
          status?: string
          updated_at?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_app_wabas_meta_app_id_fkey"
            columns: ["meta_app_id"]
            isOneToOne: false
            referencedRelation: "meta_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_app_wabas_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "meta_app_wabas_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_apps: {
        Row: {
          app_domains: string[]
          business_portfolio_id: string | null
          created_at: string
          data_deletion_url: string | null
          display_name: string
          id: string
          meta_app_id: string
          metadata: Json
          namespace: string | null
          organization_id: string
          privacy_policy_url: string | null
          status: string
          terms_url: string | null
          updated_at: string
        }
        Insert: {
          app_domains?: string[]
          business_portfolio_id?: string | null
          created_at?: string
          data_deletion_url?: string | null
          display_name: string
          id?: string
          meta_app_id: string
          metadata?: Json
          namespace?: string | null
          organization_id: string
          privacy_policy_url?: string | null
          status?: string
          terms_url?: string | null
          updated_at?: string
        }
        Update: {
          app_domains?: string[]
          business_portfolio_id?: string | null
          created_at?: string
          data_deletion_url?: string | null
          display_name?: string
          id?: string
          meta_app_id?: string
          metadata?: Json
          namespace?: string | null
          organization_id?: string
          privacy_policy_url?: string | null
          status?: string
          terms_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_apps_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_apps_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "meta_apps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_apps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      meta_credentials: {
        Row: {
          business_portfolio_id: string | null
          created_at: string
          credential_type: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          last_verified_at: string | null
          meta_app_id: string | null
          metadata: Json
          name: string
          organization_id: string
          scopes: string[]
          secret_reference: string
          status: string
          updated_at: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          business_portfolio_id?: string | null
          created_at?: string
          credential_type: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          last_verified_at?: string | null
          meta_app_id?: string | null
          metadata?: Json
          name: string
          organization_id: string
          scopes?: string[]
          secret_reference: string
          status?: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          business_portfolio_id?: string | null
          created_at?: string
          credential_type?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          last_verified_at?: string | null
          meta_app_id?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          scopes?: string[]
          secret_reference?: string
          status?: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_credentials_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_credentials_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "meta_credentials_meta_app_id_fkey"
            columns: ["meta_app_id"]
            isOneToOne: false
            referencedRelation: "meta_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "meta_credentials_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "meta_credentials_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_credentials_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "meta_credentials_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "meta_credentials_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_sync_runs: {
        Row: {
          business_portfolio_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          organization_id: string
          requested_by: string | null
          started_at: string | null
          stats: Json
          status: string
          sync_type: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          business_portfolio_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id: string
          requested_by?: string | null
          started_at?: string | null
          stats?: Json
          status?: string
          sync_type: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          business_portfolio_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id?: string
          requested_by?: string | null
          started_at?: string | null
          stats?: Json
          status?: string
          sync_type?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_sync_runs_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_sync_runs_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "meta_sync_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_sync_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "meta_sync_runs_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "meta_sync_runs_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_sync_runs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "meta_sync_runs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "meta_sync_runs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          joined_at: string | null
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          joined_at?: string | null
          organization_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          joined_at?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      outgoing_webhook_deliveries: {
        Row: {
          attempt: number
          created_at: string
          delivered_at: string | null
          event_id: string | null
          event_type: string
          http_status: number | null
          id: string
          next_retry_at: string | null
          organization_id: string
          outgoing_webhook_id: string
          payload: Json
          response_excerpt: string | null
          status: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          event_id?: string | null
          event_type: string
          http_status?: number | null
          id?: string
          next_retry_at?: string | null
          organization_id: string
          outgoing_webhook_id: string
          payload: Json
          response_excerpt?: string | null
          status?: string
        }
        Update: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          event_id?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          next_retry_at?: string | null
          organization_id?: string
          outgoing_webhook_id?: string
          payload?: Json
          response_excerpt?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outgoing_webhook_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_webhook_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "outgoing_webhook_deliveries_outgoing_webhook_id_fkey"
            columns: ["outgoing_webhook_id"]
            isOneToOne: false
            referencedRelation: "outgoing_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      outgoing_webhooks: {
        Row: {
          created_at: string
          event_types: string[]
          id: string
          is_enabled: boolean
          name: string
          organization_id: string
          secret_reference: string | null
          target_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_types: string[]
          id?: string
          is_enabled?: boolean
          name: string
          organization_id: string
          secret_reference?: string | null
          target_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_types?: string[]
          id?: string
          is_enabled?: boolean
          name?: string
          organization_id?: string
          secret_reference?: string | null
          target_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outgoing_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          locale: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          locale?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          locale?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          is_secret: boolean
          key: string
          organization_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_secret?: boolean
          key: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_secret?: boolean
          key?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      tags: {
        Row: {
          category: string | null
          color_key: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          category?: string | null
          color_key?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          category?: string | null
          color_key?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          is_lead: boolean
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_lead?: boolean
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_lead?: boolean
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_number_access: {
        Row: {
          can_manage: boolean
          can_read: boolean
          can_send: boolean
          created_at: string
          organization_id: string
          team_id: string
          whatsapp_number_id: string
        }
        Insert: {
          can_manage?: boolean
          can_read?: boolean
          can_send?: boolean
          created_at?: string
          organization_id: string
          team_id: string
          whatsapp_number_id: string
        }
        Update: {
          can_manage?: boolean
          can_read?: boolean
          can_send?: boolean
          created_at?: string
          organization_id?: string
          team_id?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_number_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_number_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "team_number_access_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_number_access_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "team_number_access_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "team_number_access_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      template_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          snapshot: Json
          template_id: string
          version_no: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          snapshot: Json
          template_id: string
          version_no: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          snapshot?: Json
          template_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          category: string | null
          components: Json
          created_at: string
          id: string
          language: string
          last_synced_at: string | null
          meta_template_id: string | null
          metadata: Json
          name: string
          organization_id: string
          quality_rating: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          waba_id: string
        }
        Insert: {
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          metadata?: Json
          name: string
          organization_id: string
          quality_rating?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          waba_id: string
        }
        Update: {
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language?: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          quality_rating?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "templates_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "templates_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_access: {
        Row: {
          business_portfolio_id: string
          can_manage: boolean
          can_read: boolean
          can_send: boolean
          created_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          business_portfolio_id: string
          can_manage?: boolean
          can_read?: boolean
          can_send?: boolean
          created_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          business_portfolio_id?: string
          can_manage?: boolean
          can_read?: boolean
          can_send?: boolean
          created_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_business_access_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_business_access_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "user_business_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_business_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      user_number_access: {
        Row: {
          can_manage: boolean
          can_read: boolean
          can_send: boolean
          created_at: string
          organization_id: string
          user_id: string
          whatsapp_number_id: string
        }
        Insert: {
          can_manage?: boolean
          can_read?: boolean
          can_send?: boolean
          created_at?: string
          organization_id: string
          user_id: string
          whatsapp_number_id: string
        }
        Update: {
          can_manage?: boolean
          can_read?: boolean
          can_send?: boolean
          created_at?: string
          organization_id?: string
          user_id?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_number_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_number_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "user_number_access_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "user_number_access_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "user_number_access_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          organization_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_waba_access: {
        Row: {
          can_manage: boolean
          can_read: boolean
          can_send: boolean
          created_at: string
          organization_id: string
          user_id: string
          waba_id: string
        }
        Insert: {
          can_manage?: boolean
          can_read?: boolean
          can_send?: boolean
          created_at?: string
          organization_id: string
          user_id: string
          waba_id: string
        }
        Update: {
          can_manage?: boolean
          can_read?: boolean
          can_send?: boolean
          created_at?: string
          organization_id?: string
          user_id?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_waba_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_waba_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "user_waba_access_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "user_waba_access_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
        ]
      }
      wabas: {
        Row: {
          account_review_status: string | null
          business_portfolio_id: string
          business_verification_status: string | null
          created_at: string
          currency: string | null
          id: string
          last_synced_at: string | null
          meta_waba_id: string
          metadata: Json
          name: string | null
          organization_id: string
          status: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          account_review_status?: string | null
          business_portfolio_id: string
          business_verification_status?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          last_synced_at?: string | null
          meta_waba_id: string
          metadata?: Json
          name?: string | null
          organization_id: string
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          account_review_status?: string | null
          business_portfolio_id?: string
          business_verification_status?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          last_synced_at?: string | null
          meta_waba_id?: string
          metadata?: Json
          name?: string | null
          organization_id?: string
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wabas_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wabas_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "wabas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wabas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          app_secret_credential_id: string | null
          created_at: string
          endpoint_type: string
          id: string
          last_event_at: string | null
          last_failure_at: string | null
          last_success_at: string | null
          meta_app_id: string | null
          metadata: Json
          organization_id: string
          status: string
          updated_at: string
          url: string
          verification_status: string | null
          verify_token_credential_id: string | null
        }
        Insert: {
          app_secret_credential_id?: string | null
          created_at?: string
          endpoint_type?: string
          id?: string
          last_event_at?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          meta_app_id?: string | null
          metadata?: Json
          organization_id: string
          status?: string
          updated_at?: string
          url: string
          verification_status?: string | null
          verify_token_credential_id?: string | null
        }
        Update: {
          app_secret_credential_id?: string | null
          created_at?: string
          endpoint_type?: string
          id?: string
          last_event_at?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          meta_app_id?: string | null
          metadata?: Json
          organization_id?: string
          status?: string
          updated_at?: string
          url?: string
          verification_status?: string | null
          verify_token_credential_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_app_secret_credential_id_fkey"
            columns: ["app_secret_credential_id"]
            isOneToOne: false
            referencedRelation: "meta_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_endpoints_meta_app_id_fkey"
            columns: ["meta_app_id"]
            isOneToOne: false
            referencedRelation: "meta_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_endpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_endpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "webhook_endpoints_verify_token_credential_id_fkey"
            columns: ["verify_token_credential_id"]
            isOneToOne: false
            referencedRelation: "meta_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_event_attempts: {
        Row: {
          attempt_no: number
          completed_at: string | null
          error: string | null
          id: string
          organization_id: string
          started_at: string
          status: string
          webhook_event_id: string
        }
        Insert: {
          attempt_no: number
          completed_at?: string | null
          error?: string | null
          id?: string
          organization_id: string
          started_at?: string
          status: string
          webhook_event_id: string
        }
        Update: {
          attempt_no?: number
          completed_at?: string | null
          error?: string | null
          id?: string
          organization_id?: string
          started_at?: string
          status?: string
          webhook_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_event_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_event_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "webhook_event_attempts_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          business_portfolio_id: string | null
          created_at: string
          deduplication_key: string
          error: string | null
          event_type: string
          id: string
          meta_app_id: string | null
          meta_message_id: string | null
          meta_phone_number_id: string | null
          meta_waba_id: string | null
          organization_id: string
          payload: Json
          processed_at: string | null
          queued_at: string | null
          received_at: string
          signature_valid: boolean | null
          status: string
          waba_id: string | null
          webhook_endpoint_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          attempts?: number
          business_portfolio_id?: string | null
          created_at?: string
          deduplication_key: string
          error?: string | null
          event_type: string
          id?: string
          meta_app_id?: string | null
          meta_message_id?: string | null
          meta_phone_number_id?: string | null
          meta_waba_id?: string | null
          organization_id: string
          payload: Json
          processed_at?: string | null
          queued_at?: string | null
          received_at?: string
          signature_valid?: boolean | null
          status?: string
          waba_id?: string | null
          webhook_endpoint_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          attempts?: number
          business_portfolio_id?: string | null
          created_at?: string
          deduplication_key?: string
          error?: string | null
          event_type?: string
          id?: string
          meta_app_id?: string | null
          meta_message_id?: string | null
          meta_phone_number_id?: string | null
          meta_waba_id?: string | null
          organization_id?: string
          payload?: Json
          processed_at?: string | null
          queued_at?: string | null
          received_at?: string
          signature_valid?: boolean | null
          status?: string
          waba_id?: string | null
          webhook_endpoint_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["business_portfolio_id"]
          },
          {
            foreignKeyName: "webhook_events_meta_app_id_fkey"
            columns: ["meta_app_id"]
            isOneToOne: false
            referencedRelation: "meta_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "webhook_events_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "webhook_events_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_webhook_endpoint_id_fkey"
            columns: ["webhook_endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_number_message_stats_24h"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "webhook_events_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["whatsapp_number_id"]
          },
          {
            foreignKeyName: "webhook_events_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_numbers: {
        Row: {
          code_verification_status: string | null
          country: string | null
          created_at: string
          default_language: string | null
          department: string | null
          display_phone_number: string | null
          id: string
          internal_name: string | null
          is_default: boolean
          is_enabled: boolean
          last_api_failure_at: string | null
          last_api_success_at: string | null
          last_incoming_message_at: string | null
          last_outgoing_message_at: string | null
          last_synced_at: string | null
          messaging_limit: string | null
          meta_phone_number_id: string
          metadata: Json
          normalized_phone_number: string | null
          organization_id: string
          platform_type: string | null
          purpose: string | null
          quality_rating: string | null
          status: string
          tags: string[]
          throughput_level: string | null
          timezone: string | null
          updated_at: string
          verified_name: string | null
          waba_id: string
          webhook_status: string | null
        }
        Insert: {
          code_verification_status?: string | null
          country?: string | null
          created_at?: string
          default_language?: string | null
          department?: string | null
          display_phone_number?: string | null
          id?: string
          internal_name?: string | null
          is_default?: boolean
          is_enabled?: boolean
          last_api_failure_at?: string | null
          last_api_success_at?: string | null
          last_incoming_message_at?: string | null
          last_outgoing_message_at?: string | null
          last_synced_at?: string | null
          messaging_limit?: string | null
          meta_phone_number_id: string
          metadata?: Json
          normalized_phone_number?: string | null
          organization_id: string
          platform_type?: string | null
          purpose?: string | null
          quality_rating?: string | null
          status?: string
          tags?: string[]
          throughput_level?: string | null
          timezone?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_id: string
          webhook_status?: string | null
        }
        Update: {
          code_verification_status?: string | null
          country?: string | null
          created_at?: string
          default_language?: string | null
          department?: string | null
          display_phone_number?: string | null
          id?: string
          internal_name?: string | null
          is_default?: boolean
          is_enabled?: boolean
          last_api_failure_at?: string | null
          last_api_success_at?: string | null
          last_incoming_message_at?: string | null
          last_outgoing_message_at?: string | null
          last_synced_at?: string | null
          messaging_limit?: string | null
          meta_phone_number_id?: string
          metadata?: Json
          normalized_phone_number?: string | null
          organization_id?: string
          platform_type?: string | null
          purpose?: string | null
          quality_rating?: string | null
          status?: string
          tags?: string[]
          throughput_level?: string | null
          timezone?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_id?: string
          webhook_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_numbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_numbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "whatsapp_numbers_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["waba_id"]
          },
          {
            foreignKeyName: "whatsapp_numbers_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_number_message_stats_24h: {
        Row: {
          display_phone_number: string | null
          failed_24h: number | null
          incoming_24h: number | null
          organization_id: string | null
          outgoing_24h: number | null
          total_24h: number | null
          whatsapp_number_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_numbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_numbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_structure"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      v_whatsapp_structure: {
        Row: {
          business_name: string | null
          business_portfolio_id: string | null
          display_phone_number: string | null
          internal_name: string | null
          last_incoming_message_at: string | null
          last_outgoing_message_at: string | null
          messaging_limit: string | null
          meta_business_id: string | null
          meta_phone_number_id: string | null
          meta_waba_id: string | null
          normalized_phone_number: string | null
          organization_id: string | null
          organization_name: string | null
          quality_rating: string | null
          status: string | null
          verified_name: string | null
          waba_id: string | null
          waba_name: string | null
          webhook_status: string | null
          whatsapp_number_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      azwa_can_dispatch_number: {
        Args: { p_number_id: string; p_permission: string }
        Returns: boolean
      }
      azwa_can_manage_number: {
        Args: { p_number_id: string; p_permission?: string }
        Returns: boolean
      }
      azwa_can_manage_waba: {
        Args: { p_permission?: string; p_waba_id: string }
        Returns: boolean
      }
      azwa_can_send_number: { Args: { p_number_id: string }; Returns: boolean }
      azwa_has_org_permission: {
        Args: { p_org_id: string; p_permission: string }
        Returns: boolean
      }
      backend_apply_message_status: {
        Args: {
          p_meta_phone_number_id: string
          p_organization_id: string
          p_status: Json
        }
        Returns: Json
      }
      backend_bootstrap_owner: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: undefined
      }
      backend_claim_jobs: {
        Args: { p_limit?: number; p_queue_names: string[]; p_worker_id: string }
        Returns: {
          attempt: number
          available_at: string
          completed_at: string | null
          created_at: string
          deduplication_key: string | null
          error: string | null
          failed_at: string | null
          id: string
          job_type: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          organization_id: string
          payload: Json
          priority: number
          queue_name: string
          started_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      backend_complete_job: { Args: { p_job_id: string }; Returns: undefined }
      backend_create_outbox: {
        Args: {
          p_campaign_id?: string
          p_campaign_recipient_id?: string
          p_contact_id?: string
          p_conversation_id?: string
          p_idempotency_key: string
          p_message_type: string
          p_recipient_address: string
          p_request_payload: Json
          p_requested_by?: string
          p_whatsapp_number_id: string
        }
        Returns: Json
      }
      backend_decrypt_secret_reference: {
        Args: { p_secret_reference: string }
        Returns: string
      }
      backend_defer_job: {
        Args: { p_job_id: string; p_seconds?: number }
        Returns: undefined
      }
      backend_enqueue_campaign: {
        Args: { p_campaign_id: string; p_requested_by: string }
        Returns: Json
      }
      backend_enqueue_outgoing_webhook: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_organization_id: string
          p_outgoing_webhook_id: string
          p_payload: Json
        }
        Returns: Json
      }
      backend_fail_job: {
        Args: {
          p_error: string
          p_job_id: string
          p_retry_after_seconds?: number
        }
        Returns: string
      }
      backend_finalize_outbox_failure: {
        Args: { p_error: string; p_final?: boolean; p_outbox_id: string }
        Returns: undefined
      }
      backend_finalize_outbox_success: {
        Args: {
          p_meta_message_id: string
          p_outbox_id: string
          p_raw_response: Json
        }
        Returns: Json
      }
      backend_ingest_inbound_message: {
        Args: {
          p_contact_profile_name: string
          p_contact_wa_id: string
          p_message: Json
          p_meta_phone_number_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      backend_ingest_webhook_event: {
        Args: {
          p_deduplication_key: string
          p_event_type: string
          p_meta_app_id: string
          p_meta_message_id: string
          p_meta_phone_number_id: string
          p_meta_waba_id: string
          p_organization_id: string
          p_payload: Json
          p_signature_valid: boolean
          p_webhook_endpoint_id: string
        }
        Returns: Json
      }
      backend_list_webhook_secrets: {
        Args: never
        Returns: {
          app_secret: string
          meta_app_id: string
          organization_id: string
          verify_token: string
          webhook_endpoint_id: string
        }[]
      }
      backend_requeue_stale_jobs: {
        Args: { p_older_than_seconds?: number }
        Returns: number
      }
      backend_resolve_meta_token: {
        Args: {
          p_business_portfolio_id: string
          p_waba_id: string
          p_whatsapp_number_id: string
        }
        Returns: {
          credential_id: string
          credential_type: string
          token: string
        }[]
      }
      backend_store_meta_credential: {
        Args: {
          p_business_portfolio_id?: string
          p_credential_type: string
          p_expires_at?: string
          p_meta_app_id?: string
          p_name: string
          p_organization_id: string
          p_scopes?: string[]
          p_secret: string
          p_waba_id?: string
          p_whatsapp_number_id?: string
        }
        Returns: string
      }
      backend_store_secret: {
        Args: { p_description?: string; p_name: string; p_secret: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
