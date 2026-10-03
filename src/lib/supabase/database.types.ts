
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "amenities": {
                  Row: {
                    "active": boolean,"amenity_type": string,"created_at": string,"display_order": number,"icon": string,"id": string,"slug": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"amenity_type": string,"created_at"?: string,"display_order"?: number,"icon"?: string,"id"?: string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"amenity_type"?: string,"created_at"?: string,"display_order"?: number,"icon"?: string,"id"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"amenity_translations": {
                  Row: {
                    "amenity_id": string,"description": string,"locale": string,"name": string
                  }
                  Insert: {
                    "amenity_id": string,"description"?: string,"locale": string,"name": string
                  }
                  Update: {
                    "amenity_id"?: string,"description"?: string,"locale"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "amenity_translations_amenity_id_fkey"
      columns: ["amenity_id"]
isOneToOne: false
      referencedRelation: "amenities"
      referencedColumns: ["id"]
    }
                  ]
                },"announcements": {
                  Row: {
                    "active": boolean,"content_de": string,"content_en": string,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"publish_at": string,"title_de": string,"title_en": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"content_de"?: string,"content_en"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"publish_at"?: string,"title_de"?: string,"title_en"?: string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"content_de"?: string,"content_en"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"publish_at"?: string,"title_de"?: string,"title_en"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_label": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_label"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_label"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_messages": {
                  Row: {
                    "booking_id": string | null,"created_at": string,"direction": string,"id": string,"message": string,"provider_message_id": string | null,"sender_email": string,"sender_name": string | null,"subject": string
                  }
                  Insert: {
                    "booking_id"?: string | null,"created_at"?: string,"direction": string,"id"?: string,"message"?: string,"provider_message_id"?: string | null,"sender_email": string,"sender_name"?: string | null,"subject"?: string
                  }
                  Update: {
                    "booking_id"?: string | null,"created_at"?: string,"direction"?: string,"id"?: string,"message"?: string,"provider_message_id"?: string | null,"sender_email"?: string,"sender_name"?: string | null,"subject"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_messages_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_notes": {
                  Row: {
                    "author_id": string | null,"booking_id": string,"created_at": string,"id": string,"note": string
                  }
                  Insert: {
                    "author_id"?: string | null,"booking_id": string,"created_at"?: string,"id"?: string,"note": string
                  }
                  Update: {
                    "author_id"?: string | null,"booking_id"?: string,"created_at"?: string,"id"?: string,"note"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_notes_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "attendees": number,"booking_reference": string,"booking_type": string,"cancellation_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"created_by": string | null,"end_at": string,"guest_id": string | null,"id": string,"locale": string,"management_token_hash": string | null,"purpose": string | null,"room_id": string | null,"source": string,"start_at": string,"status": string,"updated_at": string,"user_id": string | null,"workspace_id": string | null
                  }
                  Insert: {
                    "attendees"?: number,"booking_reference": string,"booking_type": string,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"end_at": string,"guest_id"?: string | null,"id"?: string,"locale"?: string,"management_token_hash"?: string | null,"purpose"?: string | null,"room_id"?: string | null,"source": string,"start_at": string,"status"?: string,"updated_at"?: string,"user_id"?: string | null,"workspace_id"?: string | null
                  }
                  Update: {
                    "attendees"?: number,"booking_reference"?: string,"booking_type"?: string,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"end_at"?: string,"guest_id"?: string | null,"id"?: string,"locale"?: string,"management_token_hash"?: string | null,"purpose"?: string | null,"room_id"?: string | null,"source"?: string,"start_at"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string | null,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_requests": {
                  Row: {
                    "admin_notes": string,"company": string | null,"created_at": string,"email": string,"id": string,"locale": string,"message": string,"name": string,"phone": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "admin_notes"?: string,"company"?: string | null,"created_at"?: string,"email": string,"id"?: string,"locale"?: string,"message": string,"name": string,"phone"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "admin_notes"?: string,"company"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"locale"?: string,"message"?: string,"name"?: string,"phone"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"email_logs": {
                  Row: {
                    "body_html": string | null,"created_at": string,"email_type": string,"error_message": string | null,"id": string,"locale": string | null,"provider": string,"provider_message_id": string | null,"recipient": string,"related_booking_id": string | null,"related_contact_request_id": string | null,"status": string,"subject": string,"updated_at": string
                  }
                  Insert: {
                    "body_html"?: string | null,"created_at"?: string,"email_type": string,"error_message"?: string | null,"id"?: string,"locale"?: string | null,"provider"?: string,"provider_message_id"?: string | null,"recipient": string,"related_booking_id"?: string | null,"related_contact_request_id"?: string | null,"status"?: string,"subject": string,"updated_at"?: string
                  }
                  Update: {
                    "body_html"?: string | null,"created_at"?: string,"email_type"?: string,"error_message"?: string | null,"id"?: string,"locale"?: string | null,"provider"?: string,"provider_message_id"?: string | null,"recipient"?: string,"related_booking_id"?: string | null,"related_contact_request_id"?: string | null,"status"?: string,"subject"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_logs_related_booking_id_fkey"
      columns: ["related_booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_logs_related_contact_request_id_fkey"
      columns: ["related_contact_request_id"]
isOneToOne: false
      referencedRelation: "contact_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"email_templates": {
                  Row: {
                    "heading": string,"id": string,"intro": string,"locale": string,"outro": string,"subject": string,"template_key": string,"updated_at": string
                  }
                  Insert: {
                    "heading"?: string,"id"?: string,"intro"?: string,"locale": string,"outro"?: string,"subject": string,"template_key": string,"updated_at"?: string
                  }
                  Update: {
                    "heading"?: string,"id"?: string,"intro"?: string,"locale"?: string,"outro"?: string,"subject"?: string,"template_key"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"guests": {
                  Row: {
                    "company": string | null,"created_at": string,"email": string,"first_name": string,"id": string,"last_name": string,"locale": string,"phone": string | null,"updated_at": string
                  }
                  Insert: {
                    "company"?: string | null,"created_at"?: string,"email": string,"first_name": string,"id"?: string,"last_name": string,"locale"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"locale"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"media": {
                  Row: {
                    "alt_text_de": string,"alt_text_en": string,"created_at": string,"file_name": string,"file_size": number,"file_url": string,"height": number | null,"id": string,"mime_type": string,"storage_path": string,"title": string,"updated_at": string,"uploaded_by": string | null,"width": number | null
                  }
                  Insert: {
                    "alt_text_de"?: string,"alt_text_en"?: string,"created_at"?: string,"file_name": string,"file_size": number,"file_url": string,"height"?: number | null,"id"?: string,"mime_type": string,"storage_path": string,"title"?: string,"updated_at"?: string,"uploaded_by"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "alt_text_de"?: string,"alt_text_en"?: string,"created_at"?: string,"file_name"?: string,"file_size"?: number,"file_url"?: string,"height"?: number | null,"id"?: string,"mime_type"?: string,"storage_path"?: string,"title"?: string,"updated_at"?: string,"uploaded_by"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"navigation_items": {
                  Row: {
                    "active": boolean,"created_at": string,"display_order": number,"href": string,"id": string,"label_de": string,"label_en": string,"menu": string,"open_in_new_tab": boolean,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"display_order"?: number,"href": string,"id"?: string,"label_de": string,"label_en": string,"menu": string,"open_in_new_tab"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"display_order"?: number,"href"?: string,"id"?: string,"label_de"?: string,"label_en"?: string,"menu"?: string,"open_in_new_tab"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"page_section_translations": {
                  Row: {
                    "content": string,"created_at": string,"data": NonNullable<Json>,"id": string,"locale": string,"section_id": string,"subtitle": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "content"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"locale": string,"section_id": string,"subtitle"?: string,"title"?: string,"updated_at"?: string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"locale"?: string,"section_id"?: string,"subtitle"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "page_section_translations_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "page_sections"
      referencedColumns: ["id"]
    }
                  ]
                },"page_sections": {
                  Row: {
                    "active": boolean,"created_at": string,"display_order": number,"id": string,"media_id": string | null,"page_id": string,"section_type": string,"settings": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"display_order"?: number,"id"?: string,"media_id"?: string | null,"page_id": string,"section_type": string,"settings"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"display_order"?: number,"id"?: string,"media_id"?: string | null,"page_id"?: string,"section_type"?: string,"settings"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "page_sections_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "page_sections_page_id_fkey"
      columns: ["page_id"]
isOneToOne: false
      referencedRelation: "pages"
      referencedColumns: ["id"]
    }
                  ]
                },"page_translations": {
                  Row: {
                    "created_at": string,"id": string,"locale": string,"og_description": string,"og_title": string,"page_id": string,"seo_description": string,"seo_title": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"locale": string,"og_description"?: string,"og_title"?: string,"page_id": string,"seo_description"?: string,"seo_title"?: string,"title"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"locale"?: string,"og_description"?: string,"og_title"?: string,"page_id"?: string,"seo_description"?: string,"seo_title"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "page_translations_page_id_fkey"
      columns: ["page_id"]
isOneToOne: false
      referencedRelation: "pages"
      referencedColumns: ["id"]
    }
                  ]
                },"pages": {
                  Row: {
                    "canonical_url": string | null,"created_at": string,"id": string,"is_system": boolean,"noindex": boolean,"page_type": string,"published_at": string | null,"seo_image_id": string | null,"slug": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "canonical_url"?: string | null,"created_at"?: string,"id"?: string,"is_system"?: boolean,"noindex"?: boolean,"page_type"?: string,"published_at"?: string | null,"seo_image_id"?: string | null,"slug": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "canonical_url"?: string | null,"created_at"?: string,"id"?: string,"is_system"?: boolean,"noindex"?: boolean,"page_type"?: string,"published_at"?: string | null,"seo_image_id"?: string | null,"slug"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pages_seo_image_id_fkey"
      columns: ["seo_image_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"private_settings": {
                  Row: {
                    "booking_admin_notification_enabled": boolean,"contact_admin_notification_enabled": boolean,"contact_confirmation_enabled": boolean,"contact_destination_email": string,"id": number,"updated_at": string
                  }
                  Insert: {
                    "booking_admin_notification_enabled"?: boolean,"contact_admin_notification_enabled"?: boolean,"contact_confirmation_enabled"?: boolean,"contact_destination_email"?: string,"id"?: number,"updated_at"?: string
                  }
                  Update: {
                    "booking_admin_notification_enabled"?: boolean,"contact_admin_notification_enabled"?: boolean,"contact_confirmation_enabled"?: boolean,"contact_destination_email"?: string,"id"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"company": string | null,"created_at": string,"department": string | null,"email": string,"email_verified": boolean,"first_name": string,"full_name": string | null,"id": string,"last_name": string,"phone": string | null,"preferred_locale": string,"privacy_accepted_at": string | null,"role": string,"terms_accepted_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "avatar_url"?: string | null,"company"?: string | null,"created_at"?: string,"department"?: string | null,"email": string,"email_verified"?: boolean,"first_name"?: string,"full_name"?: never,"id": string,"last_name"?: string,"phone"?: string | null,"preferred_locale"?: string,"privacy_accepted_at"?: string | null,"role"?: string,"terms_accepted_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"company"?: string | null,"created_at"?: string,"department"?: string | null,"email"?: string,"email_verified"?: boolean,"first_name"?: string,"full_name"?: never,"id"?: string,"last_name"?: string,"phone"?: string | null,"preferred_locale"?: string,"privacy_accepted_at"?: string | null,"role"?: string,"terms_accepted_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"resource_blocks": {
                  Row: {
                    "created_at": string,"created_by": string | null,"end_at": string,"id": string,"note": string | null,"reason": string,"resource_type": string,"room_id": string | null,"start_at": string,"workspace_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"end_at": string,"id"?: string,"note"?: string | null,"reason": string,"resource_type": string,"room_id"?: string | null,"start_at": string,"workspace_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"end_at"?: string,"id"?: string,"note"?: string | null,"reason"?: string,"resource_type"?: string,"room_id"?: string | null,"start_at"?: string,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "resource_blocks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resource_blocks_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resource_blocks_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"room_amenities": {
                  Row: {
                    "amenity_id": string,"room_id": string
                  }
                  Insert: {
                    "amenity_id": string,"room_id": string
                  }
                  Update: {
                    "amenity_id"?: string,"room_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_amenities_amenity_id_fkey"
      columns: ["amenity_id"]
isOneToOne: false
      referencedRelation: "amenities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_amenities_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    }
                  ]
                },"room_images": {
                  Row: {
                    "created_at": string,"display_order": number,"id": string,"is_cover": boolean,"media_id": string,"room_id": string
                  }
                  Insert: {
                    "created_at"?: string,"display_order"?: number,"id"?: string,"is_cover"?: boolean,"media_id": string,"room_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_order"?: number,"id"?: string,"is_cover"?: boolean,"media_id"?: string,"room_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_images_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_images_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "capacity": number,"created_at": string,"display_order": number,"featured": boolean,"floor": string,"full_description_de": string,"full_description_en": string,"id": string,"name": string,"public_visible": boolean,"short_description_de": string,"short_description_en": string,"slug": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "capacity"?: number,"created_at"?: string,"display_order"?: number,"featured"?: boolean,"floor"?: string,"full_description_de"?: string,"full_description_en"?: string,"id"?: string,"name": string,"public_visible"?: boolean,"short_description_de"?: string,"short_description_en"?: string,"slug": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "capacity"?: number,"created_at"?: string,"display_order"?: number,"featured"?: boolean,"floor"?: string,"full_description_de"?: string,"full_description_en"?: string,"id"?: string,"name"?: string,"public_visible"?: boolean,"short_description_de"?: string,"short_description_en"?: string,"slug"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"site_settings": {
                  Row: {
                    "address_line_1": string,"address_line_2": string,"announcement_banner_de": string,"announcement_banner_en": string,"booking_day_end": string,"booking_day_start": string,"booking_email": string,"booking_max_days_ahead": number,"booking_max_hours": number,"booking_slot_minutes": number,"booking_weekdays": (number)[],"cancellation_cutoff_hours": number,"city": string,"company_legal_name": string,"company_name": string,"country": string,"default_seo_description_de": string,"default_seo_description_en": string,"default_seo_image_id": string | null,"default_seo_title_de": string,"default_seo_title_en": string,"favicon_media_id": string | null,"footer_copyright_de": string,"footer_copyright_en": string,"footer_description_de": string,"footer_description_en": string,"footer_logo_media_id": string | null,"general_email": string,"id": number,"logo_media_id": string | null,"opening_hours_de": string,"opening_hours_en": string,"phone": string,"postcode": string,"social_links": NonNullable<Json>,"support_email": string,"updated_at": string
                  }
                  Insert: {
                    "address_line_1"?: string,"address_line_2"?: string,"announcement_banner_de"?: string,"announcement_banner_en"?: string,"booking_day_end"?: string,"booking_day_start"?: string,"booking_email"?: string,"booking_max_days_ahead"?: number,"booking_max_hours"?: number,"booking_slot_minutes"?: number,"booking_weekdays"?: (number)[],"cancellation_cutoff_hours"?: number,"city"?: string,"company_legal_name"?: string,"company_name"?: string,"country"?: string,"default_seo_description_de"?: string,"default_seo_description_en"?: string,"default_seo_image_id"?: string | null,"default_seo_title_de"?: string,"default_seo_title_en"?: string,"favicon_media_id"?: string | null,"footer_copyright_de"?: string,"footer_copyright_en"?: string,"footer_description_de"?: string,"footer_description_en"?: string,"footer_logo_media_id"?: string | null,"general_email"?: string,"id"?: number,"logo_media_id"?: string | null,"opening_hours_de"?: string,"opening_hours_en"?: string,"phone"?: string,"postcode"?: string,"social_links"?: NonNullable<Json>,"support_email"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address_line_1"?: string,"address_line_2"?: string,"announcement_banner_de"?: string,"announcement_banner_en"?: string,"booking_day_end"?: string,"booking_day_start"?: string,"booking_email"?: string,"booking_max_days_ahead"?: number,"booking_max_hours"?: number,"booking_slot_minutes"?: number,"booking_weekdays"?: (number)[],"cancellation_cutoff_hours"?: number,"city"?: string,"company_legal_name"?: string,"company_name"?: string,"country"?: string,"default_seo_description_de"?: string,"default_seo_description_en"?: string,"default_seo_image_id"?: string | null,"default_seo_title_de"?: string,"default_seo_title_en"?: string,"favicon_media_id"?: string | null,"footer_copyright_de"?: string,"footer_copyright_en"?: string,"footer_description_de"?: string,"footer_description_en"?: string,"footer_logo_media_id"?: string | null,"general_email"?: string,"id"?: number,"logo_media_id"?: string | null,"opening_hours_de"?: string,"opening_hours_en"?: string,"phone"?: string,"postcode"?: string,"social_links"?: NonNullable<Json>,"support_email"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_settings_default_seo_image_id_fkey"
      columns: ["default_seo_image_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_settings_favicon_media_id_fkey"
      columns: ["favicon_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_settings_footer_logo_media_id_fkey"
      columns: ["footer_logo_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_settings_logo_media_id_fkey"
      columns: ["logo_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_amenities": {
                  Row: {
                    "amenity_id": string,"workspace_id": string
                  }
                  Insert: {
                    "amenity_id": string,"workspace_id": string
                  }
                  Update: {
                    "amenity_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_amenities_amenity_id_fkey"
      columns: ["amenity_id"]
isOneToOne: false
      referencedRelation: "amenities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_amenities_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_images": {
                  Row: {
                    "created_at": string,"display_order": number,"id": string,"is_cover": boolean,"media_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"display_order"?: number,"id"?: string,"is_cover"?: boolean,"media_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_order"?: number,"id"?: string,"is_cover"?: boolean,"media_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_images_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_images_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "capacity": number,"created_at": string,"desk_number": string | null,"display_order": number,"featured": boolean,"floor": string,"full_description_de": string,"full_description_en": string,"id": string,"name": string,"public_visible": boolean,"short_description_de": string,"short_description_en": string,"slug": string,"status": string,"updated_at": string,"zone": string
                  }
                  Insert: {
                    "capacity"?: number,"created_at"?: string,"desk_number"?: string | null,"display_order"?: number,"featured"?: boolean,"floor"?: string,"full_description_de"?: string,"full_description_en"?: string,"id"?: string,"name": string,"public_visible"?: boolean,"short_description_de"?: string,"short_description_en"?: string,"slug": string,"status"?: string,"updated_at"?: string,"zone"?: string
                  }
                  Update: {
                    "capacity"?: number,"created_at"?: string,"desk_number"?: string | null,"display_order"?: number,"featured"?: boolean,"floor"?: string,"full_description_de"?: string,"full_description_en"?: string,"id"?: string,"name"?: string,"public_visible"?: boolean,"short_description_de"?: string,"short_description_en"?: string,"slug"?: string,"status"?: string,"updated_at"?: string,"zone"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_cancel_booking":
{ Args: { "p_booking_id": string,"p_reason"?: string }; Returns: string
                           },
"admin_create_block":
{ Args: { "p_end": string,"p_note": string,"p_reason": string,"p_resource_id": string,"p_start": string,"p_type": string }; Returns: {
              "block_id": string,"overlapping_bookings": number
            }[]
                           },
"admin_create_booking":
{ Args: { "p_attendees": number,"p_end": string,"p_guest_id": string,"p_locale": string,"p_purpose": string,"p_resource_id": string,"p_start": string,"p_type": string,"p_user_id": string }; Returns: {
              "booking_id": string,"booking_reference": string
            }[]
                           },
"admin_delete_block":
{ Args: { "p_block_id": string }; Returns: undefined
                           },
"admin_set_amenities":
{ Args: { "p_amenity_ids": (string)[],"p_resource_id": string,"p_type": string }; Returns: undefined
                           },
"admin_set_booking_token":
{ Args: { "p_booking_id": string,"p_token_hash": string }; Returns: undefined
                           },
"admin_set_gallery":
{ Args: { "p_cover_id": string,"p_media_ids": (string)[],"p_resource_id": string,"p_type": string }; Returns: undefined
                           },
"admin_set_user_role":
{ Args: { "p_role": string,"p_user_id": string }; Returns: undefined
                           },
"admin_update_booking":
{ Args: { "p_attendees": number,"p_booking_id": string,"p_end": string,"p_purpose": string,"p_resource_id": string,"p_start": string,"p_status": string,"p_type": string }; Returns: undefined
                           },
"admin_utilization":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "bookable_hours": number,"booked_hours": number,"resource_count": number,"resource_type": string
            }[]
                           },
"amenity_usage_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "amenity_id": string,"room_count": number,"workspace_count": number
            }[]
                           },
"cancel_booking_by_token":
{ Args: { "p_token_hash": string }; Returns: string
                           },
"cancel_my_booking":
{ Args: { "p_booking_id": string }; Returns: string
                           },
"create_guest_booking":
{ Args: { "p_attendees": number,"p_company": string,"p_email": string,"p_end": string,"p_first_name": string,"p_last_name": string,"p_locale": string,"p_phone": string,"p_purpose": string,"p_resource_id": string,"p_start": string,"p_token_hash": string,"p_type": string }; Returns: {
              "booking_id": string,"booking_reference": string,"guest_id": string
            }[]
                           },
"create_member_booking":
{ Args: { "p_attendees"?: number,"p_end": string,"p_locale"?: string,"p_purpose"?: string,"p_resource_id": string,"p_start": string,"p_type": string }; Returns: {
              "booking_id": string,"booking_reference": string
            }[]
                           },
"find_available_resources":
{ Args: { "p_end": string,"p_start": string,"p_type": string }; Returns: string[]
                           },
"get_busy_slots":
{ Args: { "p_from": string,"p_resource_id": string,"p_to": string,"p_type": string }; Returns: {
              "end_at": string,"kind": string,"start_at": string
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_admin_activity":
{ Args: { "p_action": string,"p_entity_id": string,"p_entity_type": string,"p_metadata"?: Json }; Returns: undefined
                           },
"media_usage":
{ Args: { "p_media_id": string }; Returns: {
              "label": string,"usage_id": string,"usage_type": string
            }[]
                           },
"media_usage_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "media_id": string,"usage_count": number
            }[]
                           },
"next_booking_reference":
{ Args: Record<PropertyKey, never>; Returns: string
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
