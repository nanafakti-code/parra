import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
    const SITE = "https://www.parragkgloves.es";

    const robots = `User-agent: *
Allow: /

# Block admin area from indexing
Disallow: /admin/
Disallow: /api/
Disallow: /profile
Disallow: /cart
Disallow: /checkout
Disallow: /cancel
Disallow: /success
Disallow: /maintenance

# Sitemap location
Sitemap: ${SITE}/sitemap.xml

# Google
User-agent: Googlebot
Allow: /
Disallow: /admin/
Disallow: /api/

# Bing
User-agent: Bingbot
Allow: /
Disallow: /admin/
Disallow: /api/

Crawl-delay: 5
`;

    return new Response(robots, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, s-maxage=86400",
        },
    });
};
