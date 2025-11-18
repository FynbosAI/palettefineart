export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      artworks: {
        Row: {
          category: string | null
          artist_name: string | null
          country_of_origin: string | null
          crating: string | null
          created_at: string | null
          declared_value: number | null
          description: string | null
          dimensions: string | null
          export_license_required: boolean | null
          id: string
          image_url: string | null
          medium: string | null
          name: string
          quote_artwork_id: string | null
          quote_id: string | null
          shipment_id: string | null
          special_requirements: Json | null
          tariff_code: string | null
          verified_at: string | null
          verified_by: string | null
          verified_condition: string | null
          weight: string | null
          weight_unit: string | null
          weight_value: number | null
          volumetric_weight_unit: string | null
          volumetric_weight_value: number | null
          has_existing_crate: boolean | null
          item_type: string | null
          period: string | null
          year_completed: number | null
        }
        Insert: {
          category?: string | null
          artist_name?: string | null
          country_of_origin?: string | null
          crating?: string | null
          created_at?: string | null
          declared_value?: number | null
          description?: string | null
          dimensions?: string | null
          export_license_required?: boolean | null
          id?: string
          image_url?: string | null
          medium?: string | null
          name: string
          quote_artwork_id?: string | null
          quote_id?: string | null
          shipment_id?: string | null
          special_requirements?: Json | null
          tariff_code?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_condition?: string | null
          weight?: string | null
          weight_unit?: string | null
          weight_value?: number | null
          volumetric_weight_unit?: string | null
          volumetric_weight_value?: number | null
          has_existing_crate?: boolean | null
          item_type?: string | null
          period?: string | null
          year_completed?: number | null
        }
        Update: {
          category?: string | null
          artist_name?: string | null
          country_of_origin?: string | null
          crating?: string | null
          created_at?: string | null
          declared_value?: number | null
          description?: string | null
          dimensions?: string | null
          export_license_required?: boolean | null
          id?: string
          image_url?: string | null
          medium?: string | null
          name?: string
          quote_artwork_id?: string | null
          quote_id?: string | null
          shipment_id?: string | null
          special_requirements?: Json | null
          tariff_code?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_condition?: string | null
          weight?: string | null
          weight_unit?: string | null
          weight_value?: number | null
          volumetric_weight_unit?: string | null
          volumetric_weight_value?: number | null
          has_existing_crate?: boolean | null
          item_type?: string | null
          period?: string | null
          year_completed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "artworks_quote_artwork_id_fkey"
            columns: ["quote_artwork_id"]
            isOneToOne: false
            referencedRelation: "quote_artworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artworks_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artworks_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artworks_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artworks_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_fields: string[] | null
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string
          retention_until: string | null
          session_id: string | null
          table_name: string
          timestamp: string | null
          user_agent: string | null
          user_id: string | null
          user_ip: unknown | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          retention_until?: string | null
          session_id?: string | null
          table_name: string
          timestamp?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_ip?: unknown | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          retention_until?: string | null
          session_id?: string | null
          table_name?: string
          timestamp?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_ip?: unknown | null
        }
        Relationships: []
      }
      bid_history: {
        Row: {
          action: string
          bid_id: string
          id: string
          new_amount: number | null
          new_status: string | null
          notes: string | null
          old_amount: number | null
          old_status: string | null
          timestamp: string | null
          user_id: string
        }
        Insert: {
          action: string
          bid_id: string
          id?: string
          new_amount?: number | null
          new_status?: string | null
          notes?: string | null
          old_amount?: number | null
          old_status?: string | null
          timestamp?: string | null
          user_id: string
        }
        Update: {
          action?: string
          bid_id?: string
          id?: string
          new_amount?: number | null
          new_status?: string | null
          notes?: string | null
          old_amount?: number | null
          old_status?: string | null
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bid_history_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_line_items: {
        Row: {
          bid_id: string
          category: string
          created_at: string | null
          description: string[]
          id: string
          is_optional: boolean | null
          notes: string | null
          quantity: number | null
          sort_order: number | null
          total_amount: number | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          bid_id: string
          category: string
          created_at?: string | null
          description: string[]
          id?: string
          is_optional?: boolean | null
          notes?: string | null
          quantity?: number | null
          sort_order?: number | null
          total_amount?: number | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          bid_id?: string
          category?: string
          created_at?: string | null
          description?: string[]
          id?: string
          is_optional?: boolean | null
          notes?: string | null
          quantity?: number | null
          sort_order?: number | null
          total_amount?: number | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_line_items_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          amount: number
          branch_org_id: string | null
          gallery_org_id: string | null
          breakdown_notes: string | null
          co2_estimate: number | null
          confirmed_at: string | null
          created_at: string | null
          estimated_transit_time: unknown | null
          id: string
          insurance_included: boolean | null
          is_draft: boolean | null
          last_modified_by: string | null
          logistics_partner_id: string | null
          needs_confirmation_at: string | null
          notes: string | null
          primary_carbon_calculation_id: string | null
          quote_id: string | null
          rejected_at: string | null
          rejection_reason: string | null
          revision: number | null
          shortlisted_at: string | null
          shortlisted_by: string | null
          show_breakdown: boolean | null
          special_services: string[] | null
          status: Database["public"]["Enums"]["bid_status"]
          submitted_at: string | null
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          amount: number
          branch_org_id?: string | null
          gallery_org_id?: string | null
          breakdown_notes?: string | null
          co2_estimate?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          estimated_transit_time?: unknown | null
          id?: string
          insurance_included?: boolean | null
          is_draft?: boolean | null
          last_modified_by?: string | null
          logistics_partner_id?: string | null
          needs_confirmation_at?: string | null
          notes?: string | null
          primary_carbon_calculation_id?: string | null
          quote_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          revision?: number | null
          shortlisted_at?: string | null
          shortlisted_by?: string | null
          show_breakdown?: boolean | null
          special_services?: string[] | null
          status?: Database["public"]["Enums"]["bid_status"]
          submitted_at?: string | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          amount?: number
          branch_org_id?: string | null
          gallery_org_id?: string | null
          breakdown_notes?: string | null
          co2_estimate?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          estimated_transit_time?: unknown | null
          id?: string
          insurance_included?: boolean | null
          is_draft?: boolean | null
          last_modified_by?: string | null
          logistics_partner_id?: string | null
          needs_confirmation_at?: string | null
          notes?: string | null
          primary_carbon_calculation_id?: string | null
          quote_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          revision?: number | null
          shortlisted_at?: string | null
          shortlisted_by?: string | null
          show_breakdown?: boolean | null
          special_services?: string[] | null
          status?: Database["public"]["Enums"]["bid_status"]
          submitted_at?: string | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bids_branch_org_fk"
            columns: ["branch_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_gallery_org_id_fkey"
            columns: ["gallery_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_logistics_partner_id_fkey"
            columns: ["logistics_partner_id"]
            isOneToOne: false
            referencedRelation: "logistics_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_primary_carbon_calculation_id_fkey"
            columns: ["primary_carbon_calculation_id"]
            isOneToOne: false
            referencedRelation: "carbon_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      bids_backup_duplicates: {
        Row: {
          amount: number | null
          backed_up_at: string | null
          backup_reason: string | null
          breakdown_notes: string | null
          co2_estimate: number | null
          created_at: string | null
          estimated_transit_time: unknown | null
          id: string | null
          insurance_included: boolean | null
          is_draft: boolean | null
          last_modified_by: string | null
          logistics_partner_id: string | null
          notes: string | null
          quote_id: string | null
          rejected_at: string | null
          rejection_reason: string | null
          show_breakdown: boolean | null
          special_services: string[] | null
          status: Database["public"]["Enums"]["bid_status"] | null
          submitted_at: string | null
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          amount?: number | null
          backed_up_at?: string | null
          backup_reason?: string | null
          breakdown_notes?: string | null
          co2_estimate?: number | null
          created_at?: string | null
          estimated_transit_time?: unknown | null
          id?: string | null
          insurance_included?: boolean | null
          is_draft?: boolean | null
          last_modified_by?: string | null
          logistics_partner_id?: string | null
          notes?: string | null
          quote_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          show_breakdown?: boolean | null
          special_services?: string[] | null
          status?: Database["public"]["Enums"]["bid_status"] | null
          submitted_at?: string | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          amount?: number | null
          backed_up_at?: string | null
          backup_reason?: string | null
          breakdown_notes?: string | null
          co2_estimate?: number | null
          created_at?: string | null
          estimated_transit_time?: unknown | null
          id?: string | null
          insurance_included?: boolean | null
          is_draft?: boolean | null
          last_modified_by?: string | null
          logistics_partner_id?: string | null
          notes?: string | null
          quote_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          show_breakdown?: boolean | null
          special_services?: string[] | null
          status?: Database["public"]["Enums"]["bid_status"] | null
          submitted_at?: string | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      carbon_calculation_variables: {
        Row: {
          calculation_formula: string | null
          category: string | null
          created_at: string | null
          description: string | null
          display_name: string
          display_order: number | null
          id: string
          is_displayed: boolean | null
          standard_reference: string | null
          unit: string
          variable_name: string
        }
        Insert: {
          calculation_formula?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_name: string
          display_order?: number | null
          id?: string
          is_displayed?: boolean | null
          standard_reference?: string | null
          unit: string
          variable_name: string
        }
        Update: {
          calculation_formula?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          display_order?: number | null
          id?: string
          is_displayed?: boolean | null
          standard_reference?: string | null
          unit?: string
          variable_name?: string
        }
        Relationships: []
      }
      carbon_calculations: {
        Row: {
          api_request: Json | null
          api_response: Json | null
          bid_id: string | null
          calculated_at: string | null
          calculated_by: string | null
          carboncare_db_id: number | null
          carboncare_report_url: string | null
          carboncare_shipment_id: string | null
          compensation_chf: number | null
          distance_km: number | null
          distance_unit: string | null
          emissions_ene: number | null
          emissions_ops: number | null
          emissions_tkm: number | null
          emissions_tot: number | null
          emissions_tot_ei: number | null
          id: string
          is_primary: boolean | null
          quote_id: string | null
          shipment_id: string | null
          status_error_code: number | null
          status_error_message: string | null
          status_is_error: boolean | null
        }
        Insert: {
          api_request?: Json | null
          api_response?: Json | null
          bid_id?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          carboncare_db_id?: number | null
          carboncare_report_url?: string | null
          carboncare_shipment_id?: string | null
          compensation_chf?: number | null
          distance_km?: number | null
          distance_unit?: string | null
          emissions_ene?: number | null
          emissions_ops?: number | null
          emissions_tkm?: number | null
          emissions_tot?: number | null
          emissions_tot_ei?: number | null
          id?: string
          is_primary?: boolean | null
          quote_id?: string | null
          shipment_id?: string | null
          status_error_code?: number | null
          status_error_message?: string | null
          status_is_error?: boolean | null
        }
        Update: {
          api_request?: Json | null
          api_response?: Json | null
          bid_id?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          carboncare_db_id?: number | null
          carboncare_report_url?: string | null
          carboncare_shipment_id?: string | null
          compensation_chf?: number | null
          distance_km?: number | null
          distance_unit?: string | null
          emissions_ene?: number | null
          emissions_ops?: number | null
          emissions_tkm?: number | null
          emissions_tot?: number | null
          emissions_tot_ei?: number | null
          id?: string
          is_primary?: boolean | null
          quote_id?: string | null
          shipment_id?: string | null
          status_error_code?: number | null
          status_error_message?: string | null
          status_is_error?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "carbon_calculations_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carbon_calculations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carbon_calculations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carbon_calculations_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carbon_calculations_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_audit: {
        Row: {
          author_identity: string
          author_user_id: string | null
          body_preview: string | null
          created_at: string
          delivery_status: string | null
          id: string
          media: Json | null
          message_sid: string
          sent_at: string
          thread_id: string
        }
        Insert: {
          author_identity: string
          author_user_id?: string | null
          body_preview?: string | null
          created_at?: string
          delivery_status?: string | null
          id?: string
          media?: Json | null
          message_sid: string
          sent_at: string
          thread_id: string
        }
        Update: {
          author_identity?: string
          author_user_id?: string | null
          body_preview?: string | null
          created_at?: string
          delivery_status?: string | null
          id?: string
          media?: Json | null
          message_sid?: string
          sent_at?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_audit_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_audit_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_thread_participants: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          last_read_at: string | null
          last_read_message_index: number | null
          left_at: string | null
          organization_id: string | null
          role: string
          thread_id: string
          twilio_identity: string
          twilio_role_sid: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          last_read_message_index?: number | null
          left_at?: string | null
          organization_id?: string | null
          role: string
          thread_id: string
          twilio_identity: string
          twilio_role_sid: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          last_read_message_index?: number | null
          left_at?: string | null
          organization_id?: string | null
          role?: string
          thread_id?: string
          twilio_identity?: string
          twilio_role_sid?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_thread_participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_thread_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_message_at: string | null
          metadata: Json
          organization_id: string
          quote_id: string
          shipment_id: string | null
          status: string
          twilio_conversation_sid: string
          twilio_unique_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string | null
          metadata?: Json
          organization_id: string
          quote_id: string
          shipment_id?: string | null
          status?: string
          twilio_conversation_sid: string
          twilio_unique_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string | null
          metadata?: Json
          organization_id?: string
          quote_id?: string
          shipment_id?: string | null
          status?: string
          twilio_conversation_sid?: string
          twilio_unique_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_items: {
        Row: {
          amount: number
          category: string | null
          id: string
          shipment_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          id?: string
          shipment_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          id?: string
          shipment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          file_url: string
          id: string
          kind: string | null
          original_filename: string | null
          shipment_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_url: string
          id?: string
          kind?: string | null
          original_filename?: string | null
          shipment_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_url?: string
          id?: string
          kind?: string | null
          original_filename?: string | null
          shipment_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address_full: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          name: string
          org_id: string | null
        }
        Insert: {
          address_full: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name: string
          org_id?: string | null
        }
        Update: {
          address_full?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_partners: {
        Row: {
          abbreviation: string
          active: boolean | null
          brand_color: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          name: string
          org_id: string | null
          rating: number | null
          regions: string[] | null
          specialties: string[] | null
          website: string | null
        }
        Insert: {
          abbreviation: string
          active?: boolean | null
          brand_color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name: string
          org_id?: string | null
          rating?: number | null
          regions?: string[] | null
          specialties?: string[] | null
          website?: string | null
        }
        Update: {
          abbreviation?: string
          active?: boolean | null
          brand_color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string | null
          rating?: number | null
          regions?: string[] | null
          specialties?: string[] | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logistics_partners_org_fk"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string | null
          location_id: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          location_id?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          location_id?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_org_location_fk"
            columns: ["org_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          id: string
          quote_id: string | null
          sender_user_id: string
          sent_at: string | null
          shipment_id: string | null
        }
        Insert: {
          content: string
          id?: string
          quote_id?: string | null
          sender_user_id: string
          sent_at?: string | null
          shipment_id?: string | null
        }
        Update: {
          content?: string
          id?: string
          quote_id?: string | null
          sender_user_id?: string
          sent_at?: string | null
          shipment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_access_log: {
        Row: {
          accessed_at: string | null
          id: string
          ip_address: unknown | null
          request_count: number | null
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string | null
          id?: string
          ip_address?: unknown | null
          request_count?: number | null
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string | null
          id?: string
          ip_address?: unknown | null
          request_count?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      organization_approved_users: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          email: string
          id: string
          notes: string | null
          org_id: string | null
          role: Database["public"]["Enums"]["org_role"] | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          email: string
          id?: string
          notes?: string | null
          org_id?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          email?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_approved_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_requests: {
        Row: {
          created_at: string | null
          id: string
          justification: string | null
          organization_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"] | null
          user_email: string
          user_full_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          justification?: string | null
          organization_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"] | null
          user_email: string
          user_full_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          justification?: string | null
          organization_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"] | null
          user_email?: string
          user_full_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          branch_location_id: string | null
          branch_name: string | null
          created_at: string | null
          id: string
          img_url: string | null
          name: string
          parent_org_id: string | null
          type: string | null
        }
        Insert: {
          branch_location_id?: string | null
          branch_name?: string | null
          created_at?: string | null
          id?: string
          img_url?: string | null
          name: string
          parent_org_id?: string | null
          type?: string | null
        }
        Update: {
          branch_location_id?: string | null
          branch_name?: string | null
          created_at?: string | null
          id?: string
          img_url?: string | null
          name?: string
          parent_org_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_branch_location_fk"
            columns: ["branch_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_parent_fk"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          default_org: string | null
          full_name: string | null
          preferred_currency: string | null
          profile_image_path: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          default_org?: string | null
          full_name?: string | null
          preferred_currency?: string | null
          profile_image_path?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          default_org?: string | null
          full_name?: string | null
          preferred_currency?: string | null
          profile_image_path?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_org_fkey"
            columns: ["default_org"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_artworks: {
        Row: {
          category: string | null
          artist_name: string | null
          country_of_origin: string | null
          crating: string | null
          created_at: string | null
          created_by: string | null
          declared_value: number | null
          description: string | null
          dimensions: string | null
          export_license_required: boolean | null
          has_existing_crate: boolean | null
          id: string
          image_url: string | null
          locked_at: string | null
          locked_by: string | null
          medium: string | null
          name: string
          item_type: string | null
          period: string | null
          quote_id: string
          special_requirements: Json | null
          tariff_code: string | null
          volumetric_weight_unit: string | null
          volumetric_weight_value: number | null
          weight: string | null
          weight_unit: string | null
          weight_value: number | null
          year_completed: number | null
        }
        Insert: {
          category?: string | null
          artist_name?: string | null
          country_of_origin?: string | null
          crating?: string | null
          created_at?: string | null
          created_by?: string | null
          declared_value?: number | null
          description?: string | null
          dimensions?: string | null
          export_license_required?: boolean | null
          has_existing_crate?: boolean | null
          id?: string
          image_url?: string | null
          locked_at?: string | null
          locked_by?: string | null
          medium?: string | null
          name: string
          item_type?: string | null
          period?: string | null
          quote_id: string
          special_requirements?: Json | null
          tariff_code?: string | null
          volumetric_weight_unit?: string | null
          volumetric_weight_value?: number | null
          weight?: string | null
          weight_unit?: string | null
          weight_value?: number | null
          year_completed?: number | null
        }
        Update: {
          category?: string | null
          artist_name?: string | null
          country_of_origin?: string | null
          crating?: string | null
          created_at?: string | null
          created_by?: string | null
          declared_value?: number | null
          description?: string | null
          dimensions?: string | null
          export_license_required?: boolean | null
          has_existing_crate?: boolean | null
          id?: string
          image_url?: string | null
          locked_at?: string | null
          locked_by?: string | null
          medium?: string | null
          name?: string
          item_type?: string | null
          period?: string | null
          quote_id?: string
          special_requirements?: Json | null
          tariff_code?: string | null
          volumetric_weight_unit?: string | null
          volumetric_weight_value?: number | null
          weight?: string | null
          weight_unit?: string | null
          weight_value?: number | null
          year_completed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_artworks_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_artworks_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_audit_events: {
        Row: {
          event_data: Json | null
          event_type: string
          id: string
          organization_id: string | null
          quote_id: string
          retention_until: string | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          event_data?: Json | null
          event_type: string
          id?: string
          organization_id?: string | null
          quote_id: string
          retention_until?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          event_data?: Json | null
          event_type?: string
          id?: string
          organization_id?: string | null
          quote_id?: string
          retention_until?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_audit_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_audit_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_invites: {
        Row: {
          branch_org_id: string
          id: string
          invited_at: string | null
          logistics_partner_id: string
          quote_id: string
        }
        Insert: {
          branch_org_id: string
          id?: string
          invited_at?: string | null
          logistics_partner_id: string
          quote_id: string
        }
        Update: {
          branch_org_id?: string
          id?: string
          invited_at?: string | null
          logistics_partner_id?: string
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_invites_branch_fk"
            columns: ["branch_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_invites_logistics_partner_id_fkey"
            columns: ["logistics_partner_id"]
            isOneToOne: false
            referencedRelation: "logistics_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_invites_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_invites_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_shipment_map: {
        Row: {
          bid_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          included_artwork_ids: string[] | null
          notes: string | null
          quote_id: string
          relationship_type: string
          shipment_id: string
        }
        Insert: {
          bid_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          included_artwork_ids?: string[] | null
          notes?: string | null
          quote_id: string
          relationship_type?: string
          shipment_id: string
        }
        Update: {
          bid_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          included_artwork_ids?: string[] | null
          notes?: string | null
          quote_id?: string
          relationship_type?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_shipment_map_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_shipment_map_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_shipment_map_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_shipment_map_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_shipment_map_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          auto_close_bidding: boolean | null
          bidding_deadline: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_reference: string | null
          origin_contact_name: string | null
          origin_contact_phone: string | null
          origin_contact_email: string | null
          destination_contact_name: string | null
          destination_contact_phone: string | null
          destination_contact_email: string | null
          created_at: string | null
          delivery_specifics: Json | null
          description: string | null
          destination_id: string | null
          id: string
          locked_at: string | null
          notes: string | null
          origin_id: string | null
          owner_org_id: string | null
          primary_carbon_calculation_id: string | null
          requirements: Json | null
          route: string | null
          shipment_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          submitted_at: string | null
          submitted_by: string | null
          target_date: string | null
          target_date_end: string | null
          target_date_start: string | null
          title: string
          type: Database["public"]["Enums"]["quote_type"]
          updated_at: string | null
          value: number | null
        }
        Insert: {
          auto_close_bidding?: boolean | null
          bidding_deadline?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_reference?: string | null
          origin_contact_name?: string | null
          origin_contact_phone?: string | null
          origin_contact_email?: string | null
          destination_contact_name?: string | null
          destination_contact_phone?: string | null
          destination_contact_email?: string | null
          created_at?: string | null
          delivery_specifics?: Json | null
          description?: string | null
          destination_id?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          origin_id?: string | null
          owner_org_id?: string | null
          primary_carbon_calculation_id?: string | null
          requirements?: Json | null
          route?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          target_date?: string | null
          target_date_end?: string | null
          target_date_start?: string | null
          title: string
          type?: Database["public"]["Enums"]["quote_type"]
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          auto_close_bidding?: boolean | null
          bidding_deadline?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_reference?: string | null
          origin_contact_name?: string | null
          origin_contact_phone?: string | null
          origin_contact_email?: string | null
          destination_contact_name?: string | null
          destination_contact_phone?: string | null
          destination_contact_email?: string | null
          created_at?: string | null
          delivery_specifics?: Json | null
          description?: string | null
          destination_id?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          origin_id?: string | null
          owner_org_id?: string | null
          primary_carbon_calculation_id?: string | null
          requirements?: Json | null
          route?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          target_date?: string | null
          target_date_end?: string | null
          target_date_start?: string | null
          title?: string
          type?: Database["public"]["Enums"]["quote_type"]
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_primary_carbon_calculation_id_fkey"
            columns: ["primary_carbon_calculation_id"]
            isOneToOne: false
            referencedRelation: "carbon_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_signup: {
        Row: {
          ip_address: unknown
          last_request: string | null
          request_count: number | null
          window_start: string | null
        }
        Insert: {
          ip_address: unknown
          last_request?: string | null
          request_count?: number | null
          window_start?: string | null
        }
        Update: {
          ip_address?: unknown
          last_request?: string | null
          request_count?: number | null
          window_start?: string | null
        }
        Relationships: []
      }
      session_links: {
        Row: {
          branch_org_id: string | null
          company_org_id: string | null
          created_at: string
          encrypted_refresh: string
          expires_at: string
          id: string
          nonce: string
          redirect_path: string | null
          target_app: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          branch_org_id?: string | null
          company_org_id?: string | null
          created_at?: string
          encrypted_refresh: string
          expires_at: string
          id?: string
          nonce: string
          redirect_path?: string | null
          target_app: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          branch_org_id?: string | null
          company_org_id?: string | null
          created_at?: string
          encrypted_refresh?: string
          expires_at?: string
          id?: string
          nonce?: string
          redirect_path?: string | null
          target_app?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_links_branch_fk"
            columns: ["branch_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_links_company_fk"
            columns: ["company_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_change_requests: {
        Row: {
          change_type: Database["public"]["Enums"]["change_request_type"]
          created_at: string | null
          id: string
          initiated_by: string
          notes: string | null
          proposal: Json | null
          proposed_amount: number | null
          proposed_delivery_date: string | null
          proposed_ship_date: string | null
          responded_at: string | null
          responded_by: string | null
          response_notes: string | null
          shipment_id: string
          status: Database["public"]["Enums"]["change_request_status"]
          updated_at: string | null
        }
        Insert: {
          change_type: Database["public"]["Enums"]["change_request_type"]
          created_at?: string | null
          id?: string
          initiated_by: string
          notes?: string | null
          proposal?: Json | null
          proposed_amount?: number | null
          proposed_delivery_date?: string | null
          proposed_ship_date?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          shipment_id: string
          status?: Database["public"]["Enums"]["change_request_status"]
          updated_at?: string | null
        }
        Update: {
          change_type?: Database["public"]["Enums"]["change_request_type"]
          created_at?: string | null
          id?: string
          initiated_by?: string
          notes?: string | null
          proposal?: Json | null
          proposed_amount?: number | null
          proposed_delivery_date?: string | null
          proposed_ship_date?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          shipment_id?: string
          status?: Database["public"]["Enums"]["change_request_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_change_requests_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_change_requests_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          access_requirements: string[] | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          carbon_details: Json | null
          carbon_estimate: number | null
          carbon_offset: boolean | null
          client_reference: string | null
          origin_contact_name: string | null
          origin_contact_phone: string | null
          origin_contact_email: string | null
          destination_contact_name: string | null
          destination_contact_phone: string | null
          destination_contact_email: string | null
          code: string
          condition_check_requirements: string[] | null
          condition_report: string | null
          consolidation_notes: string | null
          created_at: string | null
          delivery_requirements: string[] | null
          destination_id: string | null
          estimated_arrival: string | null
          id: string
          insurance_provider: string | null
          insurance_type: Database["public"]["Enums"]["insurance_type"] | null
          is_consolidated: boolean | null
          logistics_partner: string | null
          logistics_partner_id: string | null
          name: string
          origin_id: string | null
          owner_org_id: string | null
          packing_requirements: string | null
          parent_shipment_id: string | null
          primary_carbon_calculation_id: string | null
          quote_id: string | null
          safety_security_requirements: string[] | null
          security_level: Database["public"]["Enums"]["security_level"] | null
          security_measures: string | null
          ship_date: string | null
          special_services: string[] | null
          status: Database["public"]["Enums"]["shipment_status"]
          total_value: number | null
          transit_time: unknown | null
          transport_method:
            | Database["public"]["Enums"]["transport_method"]
            | null
          updated_at: string | null
        }
        Insert: {
          access_requirements?: string[] | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          carbon_details?: Json | null
          carbon_estimate?: number | null
          carbon_offset?: boolean | null
          client_reference?: string | null
          origin_contact_name?: string | null
          origin_contact_phone?: string | null
          origin_contact_email?: string | null
          destination_contact_name?: string | null
          destination_contact_phone?: string | null
          destination_contact_email?: string | null
          code: string
          condition_check_requirements?: string[] | null
          condition_report?: string | null
          consolidation_notes?: string | null
          created_at?: string | null
          delivery_requirements?: string[] | null
          destination_id?: string | null
          estimated_arrival?: string | null
          id?: string
          insurance_provider?: string | null
          insurance_type?: Database["public"]["Enums"]["insurance_type"] | null
          is_consolidated?: boolean | null
          logistics_partner?: string | null
          logistics_partner_id?: string | null
          name: string
          origin_id?: string | null
          owner_org_id?: string | null
          packing_requirements?: string | null
          parent_shipment_id?: string | null
          primary_carbon_calculation_id?: string | null
          quote_id?: string | null
          safety_security_requirements?: string[] | null
          security_level?: Database["public"]["Enums"]["security_level"] | null
          security_measures?: string | null
          ship_date?: string | null
          special_services?: string[] | null
          status?: Database["public"]["Enums"]["shipment_status"]
          total_value?: number | null
          transit_time?: unknown | null
          transport_method?:
            | Database["public"]["Enums"]["transport_method"]
            | null
          updated_at?: string | null
        }
        Update: {
          access_requirements?: string[] | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          carbon_details?: Json | null
          carbon_estimate?: number | null
          carbon_offset?: boolean | null
          client_reference?: string | null
          origin_contact_name?: string | null
          origin_contact_phone?: string | null
          origin_contact_email?: string | null
          destination_contact_name?: string | null
          destination_contact_phone?: string | null
          destination_contact_email?: string | null
          code?: string
          condition_check_requirements?: string[] | null
          condition_report?: string | null
          consolidation_notes?: string | null
          created_at?: string | null
          delivery_requirements?: string[] | null
          destination_id?: string | null
          estimated_arrival?: string | null
          id?: string
          insurance_provider?: string | null
          insurance_type?: Database["public"]["Enums"]["insurance_type"] | null
          is_consolidated?: boolean | null
          logistics_partner?: string | null
          logistics_partner_id?: string | null
          name?: string
          origin_id?: string | null
          owner_org_id?: string | null
          packing_requirements?: string | null
          parent_shipment_id?: string | null
          primary_carbon_calculation_id?: string | null
          quote_id?: string | null
          safety_security_requirements?: string[] | null
          security_level?: Database["public"]["Enums"]["security_level"] | null
          security_measures?: string | null
          ship_date?: string | null
          special_services?: string[] | null
          status?: Database["public"]["Enums"]["shipment_status"]
          total_value?: number | null
          transit_time?: unknown | null
          transport_method?:
            | Database["public"]["Enums"]["transport_method"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_logistics_partner_id_fkey"
            columns: ["logistics_partner_id"]
            isOneToOne: false
            referencedRelation: "logistics_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_parent_shipment_id_fkey"
            columns: ["parent_shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_parent_shipment_id_fkey"
            columns: ["parent_shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_primary_carbon_calculation_id_fkey"
            columns: ["primary_carbon_calculation_id"]
            isOneToOne: false
            referencedRelation: "carbon_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes_with_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          event_time: string
          id: string
          location: string | null
          notes: string | null
          shipment_id: string | null
          status: Database["public"]["Enums"]["shipment_status"] | null
        }
        Insert: {
          event_time?: string
          id?: string
          location?: string | null
          notes?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["shipment_status"] | null
        }
        Update: {
          event_time?: string
          id?: string
          location?: string | null
          notes?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["shipment_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_shipment_code: {
        Row: {
          "?column?": string | null
        }
        Insert: {
          "?column?"?: string | null
        }
        Update: {
          "?column?"?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      current_membership: {
        Row: {
          org_id: string | null
          role: Database["public"]["Enums"]["org_role"] | null
          user_id: string | null
        }
        Insert: {
          org_id?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          user_id?: string | null
        }
        Update: {
          org_id?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes_with_counts: {
        Row: {
          artwork_count: number | null
          auto_close_bidding: boolean | null
          bid_count: number | null
          bidding_deadline: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_reference: string | null
          created_at: string | null
          delivery_specifics: Json | null
          description: string | null
          destination_id: string | null
          id: string | null
          locked_at: string | null
          notes: string | null
          origin_id: string | null
          owner_org_id: string | null
          requirements: Json | null
          route: string | null
          shipment_id: string | null
          status: Database["public"]["Enums"]["quote_status"] | null
          submitted_at: string | null
          submitted_bid_count: number | null
          submitted_by: string | null
          target_date: string | null
          target_date_end: string | null
          target_date_start: string | null
          title: string | null
          type: Database["public"]["Enums"]["quote_type"] | null
          updated_at: string | null
          value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_details_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      session_links_api: {
        Row: {
          branch_org_id: string | null
          company_org_id: string | null
          encrypted_refresh_b64: string | null
          expires_at: string | null
          id: string | null
          nonce_b64: string | null
          redirect_path: string | null
          target_app: string | null
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          branch_org_id?: string | null
          company_org_id?: string | null
          encrypted_refresh_b64?: never
          expires_at?: string | null
          id?: string | null
          nonce_b64?: never
          redirect_path?: string | null
          target_app?: string | null
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          branch_org_id?: string | null
          company_org_id?: string | null
          encrypted_refresh_b64?: never
          expires_at?: string | null
          id?: string | null
          nonce_b64?: never
          redirect_path?: string | null
          target_app?: string | null
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_links_branch_fk"
            columns: ["branch_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_links_company_fk"
            columns: ["company_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_details_view: {
        Row: {
          artwork_count: number | null
          code: string | null
          created_at: string | null
          destination_address: string | null
          destination_contact_name: string | null
          destination_contact_phone: string | null
          destination_name: string | null
          estimated_arrival: string | null
          id: string | null
          last_tracking_update: string | null
          logistics_partner_abbr: string | null
          logistics_partner_color: string | null
          logistics_partner_name: string | null
          name: string | null
          organization_name: string | null
          origin_address: string | null
          origin_contact_name: string | null
          origin_contact_phone: string | null
          origin_name: string | null
          status: Database["public"]["Enums"]["shipment_status"] | null
          total_value: number | null
          tracking_event_count: number | null
          transport_method:
            | Database["public"]["Enums"]["transport_method"]
            | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_bid: {
        Args: { bid_id: string }
        Returns: undefined
      }
      accept_bid_with_compliance: {
        Args:
          | { p_bid_id: string; p_branch_org_id: string; p_quote_id: string }
          | { p_bid_id: string; p_quote_id: string }
        Returns: string
      }
      accept_counter_offer: {
        Args: { p_bid_id: string; p_change_request_id: string; p_branch_org_id?: string }
        Returns: Json
      }
      accept_rebid_after_change: {
        Args: { p_bid_id: string; p_shipment_id: string }
        Returns: Json
      }
      add_approved_user: {
        Args: {
          notes?: string
          org_id: string
          user_email: string
          user_role?: string
        }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      approve_change_request: {
        Args: { p_change_request_id: string; p_response_notes?: string; p_branch_org_id?: string }
        Returns: Json
      }
      calculate_bid_total: {
        Args: { bid_id: string }
        Returns: number
      }
      cancel_accepted_bid: {
        Args: { bid_id: string; cancellation_reason: string }
        Returns: undefined
      }
      cancel_shipment: {
        Args: { p_reason: string; p_shipment_id: string }
        Returns: undefined
      }
      close_expired_quotes: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      confirm_bid: {
        Args: { p_bid_id: string }
        Returns: undefined
      }
      consolidate_quotes_to_shipment: {
        Args: { p_primary_bid_id: string; p_quote_ids: string[] }
        Returns: string
      }
      counter_change_request: {
        Args: {
          p_change_request_id: string
          p_new_amount: number
          p_notes?: string
          p_branch_org_id?: string
        }
        Returns: Json
      }
      create_change_request: {
        Args: {
          p_change_type?: string
          p_destination_location?: Json
          p_new_delivery_specifics?: Json
          p_new_destination_id?: string
          p_new_origin_id?: string
          p_new_requirements?: Json
          p_notes?: string
          p_origin_location?: Json
          p_proposal?: Json
          p_proposed_delivery_date?: string
          p_proposed_ship_date?: string
          p_shipment_id: string
        }
        Returns: Json
      }
      create_organization_with_admin: {
        Args: {
          _branch_location_id?: string
          _branch_name?: string
          _org_name: string
          _org_type?: string
          _user_id?: string
        }
        Returns: Json
      }
      get_organization_access_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          requests_last_day: number
          requests_last_hour: number
          total_requests: number
          unique_ips: number
        }[]
      }
      get_organizations_for_signup: {
        Args: { client_ip?: unknown; user_agent?: string }
        Returns: {
          branches: Json
          company_name: string
          company_org_id: string
        }[]
      }
      get_status_color: {
        Args: { status: string }
        Returns: string
      }
      join_organization_if_approved: {
        Args: { org_id: string; user_email: string; user_id: string }
        Returns: {
          message: string
          role: string
          success: boolean
        }[]
      }
      mark_shipment_delivered: {
        Args: { p_branch_org_id: string; p_shipment_id: string }
        Returns: {
          access_requirements: string[] | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          carbon_details: Json | null
          carbon_estimate: number | null
          carbon_offset: boolean | null
          client_reference: string | null
          code: string
          condition_check_requirements: string[] | null
          condition_report: string | null
          consolidation_notes: string | null
          created_at: string | null
          delivery_requirements: string[] | null
          destination_id: string | null
          estimated_arrival: string | null
          id: string
          insurance_provider: string | null
          insurance_type: Database["public"]["Enums"]["insurance_type"] | null
          is_consolidated: boolean | null
          logistics_partner: string | null
          logistics_partner_id: string | null
          name: string
          origin_id: string | null
          owner_org_id: string | null
          packing_requirements: string | null
          parent_shipment_id: string | null
          primary_carbon_calculation_id: string | null
          quote_id: string | null
          safety_security_requirements: string[] | null
          security_level: Database["public"]["Enums"]["security_level"] | null
          security_measures: string | null
          ship_date: string | null
          special_services: string[] | null
          status: Database["public"]["Enums"]["shipment_status"]
          total_value: number | null
          transit_time: unknown | null
          transport_method:
            | Database["public"]["Enums"]["transport_method"]
            | null
          updated_at: string | null
        }
      }
      purge_expired_session_links: {
        Args: { max_age?: unknown }
        Returns: number
      }
      reject_change_request: {
        Args: { p_change_request_id: string; p_response_notes?: string; p_branch_org_id?: string }
        Returns: Json
      }
      reject_counter_offer: {
        Args: { p_change_request_id: string; p_rejection_notes?: string; p_branch_org_id?: string }
        Returns: Json
      }
      reopen_shipment_for_bidding: {
        Args:
          | { p_new_deadline: string; p_shipment_id: string }
          | { p_shipment_id: string }
        Returns: Json
      }
      resolve_preapproved_branch: {
        Args: { p_email: string }
        Returns: {
          branch_name: string
          branch_org_id: string
          company_name: string
          company_org_id: string
          role: string
        }[]
      }
      resubmit_bid_after_change: {
        Args: { p_new_amount: number; p_notes?: string; p_quote_id: string }
        Returns: Json
      }
      rpc_reject_change_request: {
        Args: { p_change_request_id: string; p_response_notes?: string }
        Returns: Json
      }
      session_link_put: {
        Args: {
          p_branch_org_id: string
          p_company_org_id: string
          p_encrypted_refresh_b64: string
          p_expires_at: string
          p_nonce_b64: string
          p_redirect_path: string
          p_target_app: string
          p_user_id: string
        }
        Returns: {
          id: string
        }[]
      }
      set_my_default_org: {
        Args: { _org_id: string }
        Returns: undefined
      }
      set_primary_carbon_calculation: {
        Args: { p_calculation_id: string }
        Returns: undefined
      }
      submit_bid: {
        Args: { bid_id: string }
        Returns: undefined
      }
      verify_migration: {
        Args: Record<PropertyKey, never>
        Returns: {
          check_name: string
          details: string
          status: string
        }[]
      }
      withdraw_bid: {
        Args: { p_bid_id: string; p_note?: string }
        Returns: undefined
      }
      withdraw_quote: {
        Args: { p_quote_id: string; p_reason?: string }
        Returns: undefined
      }
    }
    Enums: {
      bid_status:
        | "pending"
        | "accepted"
        | "revoked_by_gallery"
        | "rejected"
        | "withdrawn"
        | "draft"
        | "cancelled_by_shipper"
        | "needs_confirmation"
        | "counter_offer"
      change_request_status:
        | "pending"
        | "approved"
        | "declined"
        | "countered"
        | "withdrawn"
      change_request_type: "scope" | "withdrawal" | "cancellation"
      insurance_type: "none" | "basic" | "comprehensive"
      org_role: "viewer" | "editor" | "admin"
      quote_status: "draft" | "active" | "completed" | "cancelled"
      quote_type: "auction" | "requested"
      request_status: "pending" | "approved" | "rejected"
      security_level: "standard" | "high" | "maximum"
      shipment_status:
        | "checking"
        | "pending"
        | "in_transit"
        | "artwork_collected"
        | "security_check"
        | "local_delivery"
        | "delivered"
        | "cancelled"
        | "pending_approval"
        | "pending_change"
      transport_method: "ground" | "air" | "sea"
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
      bid_status: [
        "pending",
        "accepted",
        "revoked_by_gallery",
        "rejected",
        "withdrawn",
        "draft",
        "cancelled_by_shipper",
        "needs_confirmation",
        "counter_offer",
      ],
      change_request_status: [
        "pending",
        "approved",
        "declined",
        "countered",
        "withdrawn",
      ],
      change_request_type: ["scope", "withdrawal", "cancellation"],
      insurance_type: ["none", "basic", "comprehensive"],
      org_role: ["viewer", "editor", "admin"],
      quote_status: ["draft", "active", "completed", "cancelled"],
      quote_type: ["auction", "requested"],
      request_status: ["pending", "approved", "rejected"],
      security_level: ["standard", "high", "maximum"],
      shipment_status: [
        "checking",
        "pending",
        "in_transit",
        "artwork_collected",
        "security_check",
        "local_delivery",
        "delivered",
        "cancelled",
        "pending_approval",
        "pending_change",
      ],
      transport_method: ["ground", "air", "sea"],
    },
  },
} as const
