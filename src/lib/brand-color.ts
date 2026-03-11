/**
 * Resolves a stored color value, replacing legacy hardcoded brand green
 * with CSS variables so the color updates dynamically from admin settings.
 *
 * @param value   - The stored color value (may be "#39FF14", "rgba(57,255,20,X)", or undefined)
 * @param fallback - CSS variable fallback (e.g. "var(--brand)" or "var(--brand-500)")
 */
export function bc(value: string | undefined | null, fallback: string): string {
    if (!value) return fallback;
    const v = value.toLowerCase().trim();
    if (v === "#39ff14") return "var(--brand)";
    if (v === "#2dd60e" || v === "#28c90d") return "var(--brand-500)";
    // Replace rgba(57, 255, 20, X) patterns with dynamic CSS variable equivalent
    if (/rgba\(57,?\s*255,?\s*20,/i.test(value)) {
        return value.replace(/rgba\(57,?\s*255,?\s*20,\s*/gi, "rgba(var(--brand-rgb), ");
    }
    return value;
}
