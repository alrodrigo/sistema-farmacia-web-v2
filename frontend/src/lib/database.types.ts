
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
            "cash_shifts": {
                  Row: {
                    "closed_at": string | null,"closing_amount_cents": number | null,"difference_cents": number | null,"expected_amount_cents": number | null,"id": string,"notes": string | null,"opened_at": string,"opening_amount_cents": number,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"closing_amount_cents"?: number | null,"difference_cents"?: number | null,"expected_amount_cents"?: number | null,"id"?: string,"notes"?: string | null,"opened_at"?: string,"opening_amount_cents"?: number,"status"?: string,"user_id": string
                  }
                  Update: {
                    "closed_at"?: string | null,"closing_amount_cents"?: number | null,"difference_cents"?: number | null,"expected_amount_cents"?: number | null,"id"?: string,"notes"?: string | null,"opened_at"?: string,"opening_amount_cents"?: number,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_shifts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "user_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string | null,"description": string | null,"icon": string | null,"id": string,"is_active": boolean | null,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"description"?: string | null,"icon"?: string | null,"id"?: string,"is_active"?: boolean | null,"name": string
                  }
                  Update: {
                    "created_at"?: string | null,"description"?: string | null,"icon"?: string | null,"id"?: string,"is_active"?: boolean | null,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fiscal_documents": {
                  Row: {
                    "cliente_nit": string | null,"cliente_razon_social": string | null,"created_at": string | null,"cuf": string | null,"estado_siat": string,"id": string,"idempotency_key": string,"intentos": number,"qr_code": string | null,"respuesta_siat": Json | null,"sale_id": string,"ultimo_intento": string | null,"xml_firmado": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_nit"?: string | null,"cliente_razon_social"?: string | null,"created_at"?: string | null,"cuf"?: string | null,"estado_siat"?: string,"id"?: string,"idempotency_key"?: string,"intentos"?: number,"qr_code"?: string | null,"respuesta_siat"?: Json | null,"sale_id": string,"ultimo_intento"?: string | null,"xml_firmado"?: string | null
                  }
                  Update: {
                    "cliente_nit"?: string | null,"cliente_razon_social"?: string | null,"created_at"?: string | null,"cuf"?: string | null,"estado_siat"?: string,"id"?: string,"idempotency_key"?: string,"intentos"?: number,"qr_code"?: string | null,"respuesta_siat"?: Json | null,"sale_id"?: string,"ultimo_intento"?: string | null,"xml_firmado"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fiscal_documents_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_movements": {
                  Row: {
                    "batch_id": string | null,"created_at": string | null,"id": string,"movement_type": string,"product_id": string,"quantity": number,"reason": string | null,"reference_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"created_at"?: string | null,"id"?: string,"movement_type": string,"product_id": string,"quantity": number,"reason"?: string | null,"reference_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "batch_id"?: string | null,"created_at"?: string | null,"id"?: string,"movement_type"?: string,"product_id"?: string,"quantity"?: number,"reason"?: string | null,"reference_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_movements_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "product_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "user_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "category": string | null,"description": string | null,"id": string,"label": string | null,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"description"?: string | null,"id"?: string,"label"?: string | null,"name": string
                  }
                  Update: {
                    "category"?: string | null,"description"?: string | null,"id"?: string,"label"?: string | null,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_batches": {
                  Row: {
                    "cost_cents": number,"created_at": string | null,"expiration_date": string | null,"id": string,"lot_number": string | null,"product_id": string,"stock": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_cents"?: number,"created_at"?: string | null,"expiration_date"?: string | null,"id"?: string,"lot_number"?: string | null,"product_id": string,"stock"?: number
                  }
                  Update: {
                    "cost_cents"?: number,"created_at"?: string | null,"expiration_date"?: string | null,"id"?: string,"lot_number"?: string | null,"product_id"?: string,"stock"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_batches_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "active_substance": string | null,"box_price_cents": number | null,"category_id": string | null,"cost_cents": number,"created_at": string | null,"description": string | null,"expiration_date": string | null,"id": string,"is_priority": boolean | null,"min_stock": number | null,"name": string,"pharmaceutical_form": string | null,"price_cents": number,"requires_prescription": boolean | null,"search_vector": unknown,"sku": string | null,"stock": number,"supplier_id": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active_substance"?: string | null,"box_price_cents"?: number | null,"category_id"?: string | null,"cost_cents"?: number,"created_at"?: string | null,"description"?: string | null,"expiration_date"?: string | null,"id"?: string,"is_priority"?: boolean | null,"min_stock"?: number | null,"name": string,"pharmaceutical_form"?: string | null,"price_cents": number,"requires_prescription"?: boolean | null,"search_vector"?: never,"sku"?: string | null,"stock"?: number,"supplier_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "active_substance"?: string | null,"box_price_cents"?: number | null,"category_id"?: string | null,"cost_cents"?: number,"created_at"?: string | null,"description"?: string | null,"expiration_date"?: string | null,"id"?: string,"is_priority"?: boolean | null,"min_stock"?: number | null,"name"?: string,"pharmaceutical_form"?: string | null,"price_cents"?: number,"requires_prescription"?: boolean | null,"search_vector"?: never,"sku"?: string | null,"stock"?: number,"supplier_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_id": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_id": string,"role_id": string
                  }
                  Update: {
                    "permission_id"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_id_fkey"
      columns: ["permission_id"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "description": string | null,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"id"?: string,"name": string
                  }
                  Update: {
                    "description"?: string | null,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sale_details": {
                  Row: {
                    "batch_id": string | null,"id": string,"product_id": string,"quantity": number,"sale_id": string,"subtotal_cents": number,"unit_cost_cents": number | null,"unit_price_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"id"?: string,"product_id": string,"quantity": number,"sale_id": string,"subtotal_cents": number,"unit_cost_cents"?: number | null,"unit_price_cents": number
                  }
                  Update: {
                    "batch_id"?: string | null,"id"?: string,"product_id"?: string,"quantity"?: number,"sale_id"?: string,"subtotal_cents"?: number,"unit_cost_cents"?: number | null,"unit_price_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_details_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "product_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_details_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_details_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "cancellation_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"cash_shift_id": string | null,"change_amount_cents": number | null,"client_name": string | null,"client_nit": string | null,"created_at": string | null,"discount_cents": number | null,"discount_percent": number | null,"discount_reason": string | null,"discount_type": string | null,"id": string,"payment_method": string | null,"received_amount_cents": number | null,"status": string | null,"total_cents": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cash_shift_id"?: string | null,"change_amount_cents"?: number | null,"client_name"?: string | null,"client_nit"?: string | null,"created_at"?: string | null,"discount_cents"?: number | null,"discount_percent"?: number | null,"discount_reason"?: string | null,"discount_type"?: string | null,"id"?: string,"payment_method"?: string | null,"received_amount_cents"?: number | null,"status"?: string | null,"total_cents": number,"user_id": string
                  }
                  Update: {
                    "cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cash_shift_id"?: string | null,"change_amount_cents"?: number | null,"client_name"?: string | null,"client_nit"?: string | null,"created_at"?: string | null,"discount_cents"?: number | null,"discount_percent"?: number | null,"discount_reason"?: string | null,"discount_type"?: string | null,"id"?: string,"payment_method"?: string | null,"received_amount_cents"?: number | null,"status"?: string | null,"total_cents"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_cash_shift_id_fkey"
      columns: ["cash_shift_id"]
isOneToOne: false
      referencedRelation: "cash_shifts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "user_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"store_settings": {
                  Row: {
                    "address": string | null,"business_name": string,"created_at": string | null,"id": string,"nit": string | null,"phone": string | null,"ticket_footer": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"business_name"?: string,"created_at"?: string | null,"id"?: string,"nit"?: string | null,"phone"?: string | null,"ticket_footer"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"business_name"?: string,"created_at"?: string | null,"id"?: string,"nit"?: string | null,"phone"?: string | null,"ticket_footer"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"suppliers": {
                  Row: {
                    "contact_name": string | null,"contact_phone": string | null,"created_at": string | null,"id": string,"is_active": boolean | null,"name": string,"nit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string | null,"id"?: string,"is_active"?: boolean | null,"name": string,"nit"?: string | null
                  }
                  Update: {
                    "contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string | null,"id"?: string,"is_active"?: boolean | null,"name"?: string,"nit"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"user_profiles": {
                  Row: {
                    "created_at": string | null,"full_name": string,"id": string,"is_active": boolean | null,"role_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"full_name": string,"id": string,"is_active"?: boolean | null,"role_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"full_name"?: string,"id"?: string,"is_active"?: boolean | null,"role_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_profiles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "cancel_sale":
{ Args: { "p_reason"?: string,"p_sale_id": string,"p_user_id": string }; Returns: Json
                           },
"create_sale":
{ Args: { "p_cash_shift_id"?: string,"p_change_amount_cents"?: number,"p_client_name"?: string,"p_client_nit"?: string,"p_items": Json,"p_payment_method"?: string,"p_received_amount_cents"?: number,"p_user_id": string }; Returns: Json
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
