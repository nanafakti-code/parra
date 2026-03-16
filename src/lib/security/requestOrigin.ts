function addOriginWithWwwVariants(originSet: Set<string>, origin: string): void {
    try {
        const parsed = new URL(origin);
        originSet.add(parsed.origin);

        const host = parsed.hostname.toLowerCase();
        if (host.startsWith('www.')) {
            parsed.hostname = host.slice(4);
            originSet.add(parsed.origin);
        } else {
            parsed.hostname = `www.${host}`;
            originSet.add(parsed.origin);
        }
    } catch {
        // Ignore malformed origin candidates.
    }
}

function buildAllowedOrigins(request: Request): Set<string> {
    const allowed = new Set<string>();

    // Runtime request URL origin.
    addOriginWithWwwVariants(allowed, new URL(request.url).origin);

    // Proxy-aware forwarded origin.
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    if (forwardedHost) {
        const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
        addOriginWithWwwVariants(allowed, `${proto}://${forwardedHost}`);
    }

    // Explicit public URL from env.
    const publicSiteUrl = import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL;
    if (publicSiteUrl) {
        addOriginWithWwwVariants(allowed, publicSiteUrl);
    }

    return allowed;
}

export function isSameOriginRequest(request: Request): boolean {
    const allowedOrigins = buildAllowedOrigins(request);
    const originHeader = request.headers.get('origin');

    if (originHeader) {
        try {
            const normalizedOrigin = new URL(originHeader).origin;
            return allowedOrigins.has(normalizedOrigin);
        } catch {
            return false;
        }
    }

    const refererHeader = request.headers.get('referer');
    if (refererHeader) {
        try {
            const refererOrigin = new URL(refererHeader).origin;
            if (allowedOrigins.has(refererOrigin)) {
                return true;
            }
        } catch {
            return false;
        }
    }

    const fetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
    if (!fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none') {
        return true;
    }

    return false;
}
