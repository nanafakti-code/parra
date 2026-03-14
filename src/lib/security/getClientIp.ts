/**
 * Extrae la IP real del cliente de forma segura.
 * Prioriza headers de Vercel que no pueden ser forjados desde fuera del edge.
 */
export function getClientIp(request: Request): string {
    // x-real-ip es seteado por Vercel edge y no puede ser forjado externamente
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp.trim();

    // Header específico de Vercel (tampoco puede ser forjado externamente)
    const vercelIp = request.headers.get('x-vercel-forwarded-for');
    if (vercelIp) return vercelIp.split(',')[0].trim();

    // Fallback para otros entornos (puede ser manipulado, usar solo en desarrollo)
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return 'unknown';
}
