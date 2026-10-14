export interface StoreSettings {
    id: string;
    business_name: string;
    nit: string | null;
    address: string | null;
    phone: string | null;
    ticket_footer: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface UpdateStoreSettingsDto {
    business_name: string;
    nit?: string | null;
    address?: string | null;
    phone?: string | null;
    ticket_footer?: string | null;
}
