import type { APIRoute } from "astro";
import { supabase } from "../lib/supabase";

export const GET: APIRoute = async () => {
    const SITE = "https://parragkgloves.es";
    const now = new Date().toISOString().split("T")[0];

    // Fetch active products for dynamic URLs
    let productSlugs: string[] = [];
    try {
        const { data } = await supabase
            .from("products")
            .select("slug, updated_at")
            .eq("is_active", true);
        productSlugs = (data || []).map((p: any) => p.slug);
    } catch (e) {
        console.error("Sitemap: error fetching products", e);
    }

    // Static pages with priorities
    const staticPages = [
        { url: "/", priority: "1.0", changefreq: "daily" },
        { url: "/shop", priority: "0.9", changefreq: "daily" },
        { url: "/brand", priority: "0.8", changefreq: "monthly" },
        { url: "/login", priority: "0.3", changefreq: "yearly" },
        { url: "/register", priority: "0.3", changefreq: "yearly" },
    ];

    const urls = [
        ...staticPages.map(
            (p) => `
    <url>
        <loc>${SITE}${p.url}</loc>
        <lastmod>${now}</lastmod>
        <changefreq>${p.changefreq}</changefreq>
        <priority>${p.priority}</priority>
    </url>`
        ),
        ...productSlugs.map(
            (slug) => `
    <url>
        <loc>${SITE}/product/${slug}</loc>
        <lastmod>${now}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`
        ),
    ].join("");

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
>
${urls}
</urlset>`;

    return new Response(sitemap, {
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600",
        },
    });
};
