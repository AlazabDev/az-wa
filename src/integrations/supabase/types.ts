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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          business_portfolio_id: string | null
          created_at: string
          description: string | null
          id: string
          metadata: Json
          resolved_at: string | null
          severity: string
          status: string
          title: string
          type: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          business_portfolio_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
          type: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          business_portfolio_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          type?: string
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
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      api_errors: {
        Row: {
          category: string
          code: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          occurrences: number
          raw_error: Json | null
          status: string
          title: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          category: string
          code?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrences?: number
          raw_error?: Json | null
          status?: string
          title: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          category?: string
          code?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrences?: number
          raw_error?: Json | null
          status?: string
          title?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
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
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      api_requests: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string
          http_status: number | null
          id: string
          meta_error_code: string | null
          meta_error_message: string | null
          method: string
          request_id: string | null
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          http_status?: number | null
          id?: string
          meta_error_code?: string | null
          meta_error_message?: string | null
          method: string
          request_id?: string | null
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          http_status?: number | null
          id?: string
          meta_error_code?: string | null
          meta_error_message?: string | null
          method?: string
          request_id?: string | null
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
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
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: string | null
          new_value: Json | null
          old_value: Json | null
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          business_portfolio_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          business_portfolio_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          actions: Json
          business_portfolio_id: string | null
          conditions: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          trigger_type: string
          updated_at: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          actions?: Json
          business_portfolio_id?: string | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          trigger_type: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          actions?: Json
          business_portfolio_id?: string | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          trigger_type?: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          rule_id: string
          status: string
          trigger_payload: Json | null
          whatsapp_number_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          rule_id: string
          status?: string
          trigger_payload?: Json | null
          whatsapp_number_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          rule_id?: string
          status?: string
          trigger_payload?: Json | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
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
          health: Database["public"]["Enums"]["health_status"]
          id: string
          last_synced_at: string | null
          meta_app_id: string | null
          meta_business_id: string
          metadata: Json
          name: string
          namespace: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          last_synced_at?: string | null
          meta_app_id?: string | null
          meta_business_id: string
          metadata?: Json
          name: string
          namespace?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          last_synced_at?: string | null
          meta_app_id?: string | null
          meta_business_id?: string
          metadata?: Json
          name?: string
          namespace?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string
          error: string | null
          id: string
          idempotency_key: string | null
          message_id: string | null
          status: Database["public"]["Enums"]["message_state"]
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          message_id?: string | null
          status?: Database["public"]["Enums"]["message_state"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          message_id?: string | null
          status?: Database["public"]["Enums"]["message_state"]
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
        ]
      }
      campaigns: {
        Row: {
          audience: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          rate_limit_per_minute: number
          scheduled_at: string | null
          sender_whatsapp_number_id: string
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          audience?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          rate_limit_per_minute?: number
          scheduled_at?: string | null
          sender_whatsapp_number_id: string
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          audience?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          rate_limit_per_minute?: number
          scheduled_at?: string | null
          sender_whatsapp_number_id?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
      contacts: {
        Row: {
          assigned_agent_id: string | null
          company: string | null
          conversation_count: number
          created_at: string
          custom_fields: Json
          email: string | null
          first_interaction_at: string | null
          id: string
          last_interaction_at: string | null
          message_count: number
          name: string | null
          notes: string | null
          phone: string | null
          profile_name: string | null
          source: string | null
          tags: string[]
          updated_at: string
          wa_id: string
        }
        Insert: {
          assigned_agent_id?: string | null
          company?: string | null
          conversation_count?: number
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_interaction_at?: string | null
          id?: string
          last_interaction_at?: string | null
          message_count?: number
          name?: string | null
          notes?: string | null
          phone?: string | null
          profile_name?: string | null
          source?: string | null
          tags?: string[]
          updated_at?: string
          wa_id: string
        }
        Update: {
          assigned_agent_id?: string | null
          company?: string | null
          conversation_count?: number
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_interaction_at?: string | null
          id?: string
          last_interaction_at?: string | null
          message_count?: number
          name?: string | null
          notes?: string | null
          phone?: string | null
          profile_name?: string | null
          source?: string | null
          tags?: string[]
          updated_at?: string
          wa_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_user_id: string | null
          business_portfolio_id: string
          contact_id: string
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          status: string
          unread_count: number
          updated_at: string
          waba_id: string
          whatsapp_number_id: string
        }
        Insert: {
          assigned_user_id?: string | null
          business_portfolio_id: string
          contact_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
          waba_id: string
          whatsapp_number_id: string
        }
        Update: {
          assigned_user_id?: string | null
          business_portfolio_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
          waba_id?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
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
            foreignKeyName: "conversations_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
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
          error: string | null
          id: string
          original_job_id: string | null
          payload: Json
          queue: string
          type: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          original_job_id?: string | null
          payload?: Json
          queue: string
          type: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          original_job_id?: string | null
          payload?: Json
          queue?: string
          type?: string
        }
        Relationships: []
      }
      health_checks: {
        Row: {
          check_name: string
          checked_at: string
          detail: string | null
          id: string
          latency_ms: number | null
          scope_id: string | null
          scope_type: string
          status: Database["public"]["Enums"]["health_status"]
        }
        Insert: {
          check_name: string
          checked_at?: string
          detail?: string | null
          id?: string
          latency_ms?: number | null
          scope_id?: string | null
          scope_type: string
          status?: Database["public"]["Enums"]["health_status"]
        }
        Update: {
          check_name?: string
          checked_at?: string
          detail?: string | null
          id?: string
          latency_ms?: number | null
          scope_id?: string | null
          scope_type?: string
          status?: Database["public"]["Enums"]["health_status"]
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: string
          name: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          name: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          name?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          error: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          max_attempts: number
          payload: Json
          queue: string
          run_after: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: string
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          max_attempts?: number
          payload?: Json
          queue: string
          run_after?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type: string
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          max_attempts?: number
          payload?: Json
          queue?: string
          run_after?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          contact_id: string | null
          download_status: string
          downloaded_at: string | null
          error: string | null
          filename: string | null
          id: string
          message_id: string | null
          meta_media_id: string | null
          mime_type: string | null
          received_at: string
          sha256: string | null
          size: number | null
          storage_bucket: string | null
          storage_path: string | null
          storage_provider: string | null
          waba_id: string | null
          whatsapp_number_id: string
        }
        Insert: {
          contact_id?: string | null
          download_status?: string
          downloaded_at?: string | null
          error?: string | null
          filename?: string | null
          id?: string
          message_id?: string | null
          meta_media_id?: string | null
          mime_type?: string | null
          received_at?: string
          sha256?: string | null
          size?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          storage_provider?: string | null
          waba_id?: string | null
          whatsapp_number_id: string
        }
        Update: {
          contact_id?: string | null
          download_status?: string
          downloaded_at?: string | null
          error?: string | null
          filename?: string | null
          id?: string
          message_id?: string | null
          meta_media_id?: string | null
          mime_type?: string | null
          received_at?: string
          sha256?: string | null
          size?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          storage_provider?: string | null
          waba_id?: string | null
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
            foreignKeyName: "media_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
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
      message_status_history: {
        Row: {
          error_code: string | null
          error_message: string | null
          id: string
          message_id: string
          occurred_at: string
          raw_payload: Json | null
          status: Database["public"]["Enums"]["message_state"]
        }
        Insert: {
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_id: string
          occurred_at?: string
          raw_payload?: Json | null
          status: Database["public"]["Enums"]["message_state"]
        }
        Update: {
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_id?: string
          occurred_at?: string
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["message_state"]
        }
        Relationships: [
          {
            foreignKeyName: "message_status_history_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          campaign_id: string | null
          caption: string | null
          contact_id: string
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          raw_payload: Json | null
          reply_to_message_id: string | null
          sent_by_user_id: string | null
          status: Database["public"]["Enums"]["message_state"]
          template_id: string | null
          timestamp: string
          type: string
          updated_at: string
          waba_id: string
          wamid: string | null
          whatsapp_number_id: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          caption?: string | null
          contact_id: string
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          raw_payload?: Json | null
          reply_to_message_id?: string | null
          sent_by_user_id?: string | null
          status?: Database["public"]["Enums"]["message_state"]
          template_id?: string | null
          timestamp?: string
          type?: string
          updated_at?: string
          waba_id: string
          wamid?: string | null
          whatsapp_number_id: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          caption?: string | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          raw_payload?: Json | null
          reply_to_message_id?: string | null
          sent_by_user_id?: string | null
          status?: Database["public"]["Enums"]["message_state"]
          template_id?: string | null
          timestamp?: string
          type?: string
          updated_at?: string
          waba_id?: string
          wamid?: string | null
          whatsapp_number_id?: string
        }
        Relationships: [
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
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
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
      meta_credentials: {
        Row: {
          business_portfolio_id: string | null
          created_at: string
          credential_type: Database["public"]["Enums"]["credential_type"]
          expires_at: string | null
          id: string
          label: string | null
          last_used_at: string | null
          last_verified_at: string | null
          secret_reference: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          business_portfolio_id?: string | null
          created_at?: string
          credential_type: Database["public"]["Enums"]["credential_type"]
          expires_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          secret_reference: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          business_portfolio_id?: string | null
          created_at?: string
          credential_type?: Database["public"]["Enums"]["credential_type"]
          expires_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          secret_reference?: string
          status?: Database["public"]["Enums"]["entity_status"]
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
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      outgoing_webhooks: {
        Row: {
          created_at: string
          enabled: boolean
          events: string[]
          id: string
          name: string
          secret_reference: string | null
          url: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          name: string
          secret_reference?: string | null
          url: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          name?: string
          secret_reference?: string | null
          url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      template_versions: {
        Row: {
          components: Json
          created_at: string
          id: string
          status: string | null
          template_id: string
          version: number
        }
        Insert: {
          components?: Json
          created_at?: string
          id?: string
          status?: string | null
          template_id: string
          version?: number
        }
        Update: {
          components?: Json
          created_at?: string
          id?: string
          status?: string | null
          template_id?: string
          version?: number
        }
        Relationships: [
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
          name: string
          quality: string | null
          status: string
          updated_at: string
          waba_id: string
        }
        Insert: {
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language?: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          name: string
          quality?: string | null
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
          name?: string
          quality?: string | null
          status?: string
          updated_at?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
          },
        ]
      }
      unmapped_number_events: {
        Row: {
          display_phone_number: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          meta_phone_number_id: string
          meta_waba_id: string | null
          occurrences: number
          payload: Json
          resolved: boolean
        }
        Insert: {
          display_phone_number?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          meta_phone_number_id: string
          meta_waba_id?: string | null
          occurrences?: number
          payload: Json
          resolved?: boolean
        }
        Update: {
          display_phone_number?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          meta_phone_number_id?: string
          meta_waba_id?: string | null
          occurrences?: number
          payload?: Json
          resolved?: boolean
        }
        Relationships: []
      }
      user_business_access: {
        Row: {
          business_portfolio_id: string
          id: string
          level: Database["public"]["Enums"]["access_level"]
          user_id: string
        }
        Insert: {
          business_portfolio_id: string
          id?: string
          level?: Database["public"]["Enums"]["access_level"]
          user_id: string
        }
        Update: {
          business_portfolio_id?: string
          id?: string
          level?: Database["public"]["Enums"]["access_level"]
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
        ]
      }
      user_number_access: {
        Row: {
          id: string
          level: Database["public"]["Enums"]["access_level"]
          user_id: string
          whatsapp_number_id: string
        }
        Insert: {
          id?: string
          level?: Database["public"]["Enums"]["access_level"]
          user_id: string
          whatsapp_number_id: string
        }
        Update: {
          id?: string
          level?: Database["public"]["Enums"]["access_level"]
          user_id?: string
          whatsapp_number_id?: string
        }
        Relationships: [
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
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_waba_access: {
        Row: {
          id: string
          level: Database["public"]["Enums"]["access_level"]
          user_id: string
          waba_id: string
        }
        Insert: {
          id?: string
          level?: Database["public"]["Enums"]["access_level"]
          user_id: string
          waba_id: string
        }
        Update: {
          id?: string
          level?: Database["public"]["Enums"]["access_level"]
          user_id?: string
          waba_id?: string
        }
        Relationships: [
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
          business_portfolio_id: string
          created_at: string
          currency: string | null
          health: Database["public"]["Enums"]["health_status"]
          id: string
          last_synced_at: string | null
          message_template_namespace: string | null
          meta_waba_id: string
          metadata: Json
          name: string | null
          status: Database["public"]["Enums"]["entity_status"]
          timezone: string | null
          updated_at: string
        }
        Insert: {
          business_portfolio_id: string
          created_at?: string
          currency?: string | null
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          last_synced_at?: string | null
          message_template_namespace?: string | null
          meta_waba_id: string
          metadata?: Json
          name?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          business_portfolio_id?: string
          created_at?: string
          currency?: string | null
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          last_synced_at?: string | null
          message_template_namespace?: string | null
          meta_waba_id?: string
          metadata?: Json
          name?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
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
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          business_portfolio_id: string | null
          deduplication_key: string | null
          error: string | null
          event_type: string | null
          id: string
          message_id: string | null
          meta_phone_number_id: string | null
          meta_waba_id: string | null
          payload: Json
          processed_at: string | null
          queued_at: string | null
          received_at: string
          signature_valid: boolean
          status: string
          waba_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          attempts?: number
          business_portfolio_id?: string | null
          deduplication_key?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          message_id?: string | null
          meta_phone_number_id?: string | null
          meta_waba_id?: string | null
          payload: Json
          processed_at?: string | null
          queued_at?: string | null
          received_at?: string
          signature_valid?: boolean
          status?: string
          waba_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          attempts?: number
          business_portfolio_id?: string | null
          deduplication_key?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          message_id?: string | null
          meta_phone_number_id?: string | null
          meta_waba_id?: string | null
          payload?: Json
          processed_at?: string | null
          queued_at?: string | null
          received_at?: string
          signature_valid?: boolean
          status?: string
          waba_id?: string | null
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
            foreignKeyName: "webhook_events_waba_id_fkey"
            columns: ["waba_id"]
            isOneToOne: false
            referencedRelation: "wabas"
            referencedColumns: ["id"]
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
          api_health: Database["public"]["Enums"]["health_status"]
          business_portfolio_id: string
          country: string | null
          created_at: string
          department: string | null
          display_phone_number: string
          enabled: boolean
          health: Database["public"]["Enums"]["health_status"]
          id: string
          internal_name: string | null
          last_incoming_at: string | null
          last_outgoing_at: string | null
          last_synced_at: string | null
          messaging_limit: string | null
          meta_phone_number_id: string
          metadata: Json
          platform_status: string | null
          purpose: string | null
          quality_rating: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tags: string[]
          updated_at: string
          verified_name: string | null
          waba_id: string
          webhook_status: Database["public"]["Enums"]["health_status"]
        }
        Insert: {
          api_health?: Database["public"]["Enums"]["health_status"]
          business_portfolio_id: string
          country?: string | null
          created_at?: string
          department?: string | null
          display_phone_number: string
          enabled?: boolean
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          internal_name?: string | null
          last_incoming_at?: string | null
          last_outgoing_at?: string | null
          last_synced_at?: string | null
          messaging_limit?: string | null
          meta_phone_number_id: string
          metadata?: Json
          platform_status?: string | null
          purpose?: string | null
          quality_rating?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tags?: string[]
          updated_at?: string
          verified_name?: string | null
          waba_id: string
          webhook_status?: Database["public"]["Enums"]["health_status"]
        }
        Update: {
          api_health?: Database["public"]["Enums"]["health_status"]
          business_portfolio_id?: string
          country?: string | null
          created_at?: string
          department?: string | null
          display_phone_number?: string
          enabled?: boolean
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          internal_name?: string | null
          last_incoming_at?: string | null
          last_outgoing_at?: string | null
          last_synced_at?: string | null
          messaging_limit?: string | null
          meta_phone_number_id?: string
          metadata?: Json
          platform_status?: string | null
          purpose?: string | null
          quality_rating?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tags?: string[]
          updated_at?: string
          verified_name?: string | null
          waba_id?: string
          webhook_status?: Database["public"]["Enums"]["health_status"]
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_numbers_business_portfolio_id_fkey"
            columns: ["business_portfolio_id"]
            isOneToOne: false
            referencedRelation: "business_portfolios"
            referencedColumns: ["id"]
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
      [_ in never]: never
    }
    Functions: {
      can_read_number: {
        Args: { _number_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      access_level: "none" | "read" | "read_send" | "manage"
      app_role:
        | "super_admin"
        | "admin"
        | "supervisor"
        | "agent"
        | "marketing"
        | "developer"
        | "viewer"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "failed"
      credential_type: "business" | "waba" | "phone" | "system_user"
      entity_status: "active" | "disabled" | "pending" | "missing" | "archived"
      health_status: "healthy" | "warning" | "critical" | "offline" | "unknown"
      job_status: "pending" | "running" | "completed" | "failed" | "dead"
      message_direction: "inbound" | "outbound"
      message_state:
        | "queued"
        | "submitted"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
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
    Enums: {
      access_level: ["none", "read", "read_send", "manage"],
      app_role: [
        "super_admin",
        "admin",
        "supervisor",
        "agent",
        "marketing",
        "developer",
        "viewer",
      ],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "failed",
      ],
      credential_type: ["business", "waba", "phone", "system_user"],
      entity_status: ["active", "disabled", "pending", "missing", "archived"],
      health_status: ["healthy", "warning", "critical", "offline", "unknown"],
      job_status: ["pending", "running", "completed", "failed", "dead"],
      message_direction: ["inbound", "outbound"],
      message_state: [
        "queued",
        "submitted",
        "sent",
        "delivered",
        "read",
        "failed",
      ],
    },
  },
} as const
