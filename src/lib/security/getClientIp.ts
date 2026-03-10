/**
 * Extrae la IP real del cliente de forma segura.
 * En entornos con reverse proxy (Vercel, Cloudflare) el header
 * x-forwarded-for puede contener una lista de IPs separadas por comas;
 * solo se toma la primera (la del cliente original).
 */
export function getClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return 'unknown';
}
