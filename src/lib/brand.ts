/**
 * Caché a nivel de módulo para la configuración de marca.
 * Evita que Layout.astro y Header.astro hagan consultas redundantes
 * a site_settings en cada render de página.
 * TTL: 5 minutos (los cambios de marca no son frecuentes).
 */
import { supabaseAdmin } from "./supabase";

interface BrandSettings {
    primary_color?: string;
    secondary_color?: string;
    logo_url?: string;
    name?: string;
    [key: string]: unknown;
}

let _cache: { value: BrandSettings; ts: number } | null = null;
const BRAND_TTL = 5 * 60_000; // 5 minutos

export async function getBrandSettings(): Promise<BrandSettings> {
    const now = Date.now();
    if (_cache && now - _cache.ts < BRAND_TTL) {
        return _cache.value;
    }
    try {
        const { data } = await supabaseAdmin
            .from("site_settings")
            .select("value")
            .eq("key", "brand")
            .single();
        const value: BrandSettings = (data?.value as BrandSettings) || {};
        _cache = { value, ts: now };
        return value;
    } catch {
        return {};
    }
}

/** Invalida manualmente el caché (llamar tras guardar cambios de marca en el admin). */
export function invalidateBrandCache() {
    _cache = null;
}
