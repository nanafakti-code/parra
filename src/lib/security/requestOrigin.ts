export function isSameOriginRequest(request: Request): boolean {
    const originHeader = request.headers.get('origin');
    const hostOrigin = new URL(request.url).origin;

    if (originHeader) {
        if (originHeader === hostOrigin) return true;

        const publicSiteUrl = import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL;
        if (publicSiteUrl) {
            try {
                const publicOrigin = new URL(publicSiteUrl).origin;
                if (originHeader === publicOrigin) return true;
            } catch {
                // Ignore invalid PUBLIC_SITE_URL and continue with strict checks.
            }
        }
        return false;
    }

    const fetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
    if (!fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none') {
        return true;
    }

    return false;
}
