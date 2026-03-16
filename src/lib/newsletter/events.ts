import { buildBroadcastEmailHtml } from './email';
import { enqueueNewsletterBroadcast, enqueueNewsletterEmail, processNewsletterQueueBatch } from './queue';
import { sanitizeNewsletterText } from './validation';
import { supabaseAdmin } from '../supabase';

const fmtEur = (n: number) =>
    n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export async function notifyNewProductPublished(options: {
    eventKey: string;
    productName: string;
    productSlug?: string | null;
}): Promise<void> {
    const title = `Nuevo producto disponible: ${sanitizeNewsletterText(options.productName)}`;
    const message = 'Acabamos de publicar un nuevo producto en la tienda. Sé de los primeros en descubrirlo y aprovechar disponibilidad inicial.';

    await enqueueNewsletterBroadcast({
        eventKey: options.eventKey,
        eventType: 'new-product',
        subject: title,
        htmlContent: buildBroadcastEmailHtml({
            title,
            message,
            badge: 'Nuevo producto',
            ctaLabel: 'Ver producto',
            ctaUrl: options.productSlug
                ? `https://www.parragkgloves.es/product/${options.productSlug}`
                : 'https://www.parragkgloves.es/shop',
        }),
        payload: {
            event: 'new-product',
            productSlug: options.productSlug || null,
        },
    });
}

export async function notifyStockUpdated(options: {
    eventKey: string;
    productName: string;
    productSlug?: string | null;
    previousStock: number;
    currentStock: number;
}): Promise<void> {
    const title = `De vuelta en stock: ${sanitizeNewsletterText(options.productName)}`;
    const message = 'El producto ha vuelto a estar disponible. Si lo estabas esperando, este es el momento de comprarlo antes de que se agote.';

    await enqueueNewsletterBroadcast({
        eventKey: options.eventKey,
        eventType: 'stock-updated',
        subject: title,
        htmlContent: buildBroadcastEmailHtml({
            title,
            message,
            badge: 'Vuelve al stock',
            ctaLabel: 'Comprar ahora',
            ctaUrl: options.productSlug
                ? `https://www.parragkgloves.es/product/${options.productSlug}`
                : 'https://www.parragkgloves.es/shop',
        }),
        payload: {
            event: 'stock-updated',
            previousStock: options.previousStock,
            currentStock: options.currentStock,
            productSlug: options.productSlug || null,
        },
    });
}

export async function notifyCouponCreated(options: {
    eventKey: string;
    couponCode: string;
    description?: string | null;
}): Promise<void> {
    const safeCode = sanitizeNewsletterText(options.couponCode.toUpperCase());
    const title = 'Tienes un cupón de descuento';

    const message = options.description
        ? sanitizeNewsletterText(options.description)
        : 'Úsalo en tu próxima compra en la tienda. ¡No dejes que caduque!';

    await enqueueNewsletterBroadcast({
        eventKey: options.eventKey,
        eventType: 'coupon-created',
        subject: `Cupón disponible: ${safeCode}`,
        htmlContent: buildBroadcastEmailHtml({
            title,
            message,
            badge: 'Cupón exclusivo',
            code: safeCode,
            ctaLabel: 'Ir a la tienda',
            ctaUrl: 'https://www.parragkgloves.es/shop',
        }),
        payload: {
            event: 'coupon-created',
            couponCode: safeCode,
        },
    });
}

export async function notifyCampaignLaunched(options: {
    eventKey: string;
    title: string;
    message: string;
    ctaUrl?: string;
    ctaLabel?: string;
}): Promise<void> {
    const title = sanitizeNewsletterText(options.title).slice(0, 120) || 'Nueva campaña de Parra GK Gloves';
    const message = sanitizeNewsletterText(options.message).slice(0, 500) || 'Tenemos una nueva campaña activa en la tienda.';

    await enqueueNewsletterBroadcast({
        eventKey: options.eventKey,
        eventType: 'campaign-launched',
        subject: title,
        htmlContent: buildBroadcastEmailHtml({
            title,
            message,
            badge: 'Campaña especial',
            ctaLabel: options.ctaLabel || 'Descubrir campaña',
            ctaUrl: options.ctaUrl || 'https://www.parragkgloves.es/shop',
        }),
        payload: {
            event: 'campaign-launched',
        },
    });
}

export async function notifyPriceDrop(options: {
    eventKey: string;
    productName: string;
    productSlug?: string | null;
    previousPrice: number;
    currentPrice: number;
}): Promise<void> {
    const name = sanitizeNewsletterText(options.productName);
    const discount = Math.round((1 - options.currentPrice / options.previousPrice) * 100);
    const title = `Bajada de precio: ${name}`;
    const message =
        `El precio de ${name} ha bajado de ${fmtEur(options.previousPrice)} a ${fmtEur(options.currentPrice)}` +
        (discount > 0 ? ` (−${discount}%)` : '') +
        `. ¡Aprovecha antes de que se acabe el stock!`;

    await enqueueNewsletterBroadcast({
        eventKey: options.eventKey,
        eventType: 'price-drop',
        subject: title,
        htmlContent: buildBroadcastEmailHtml({
            title,
            message,
            badge: discount > 0 ? `−${discount}% de descuento` : 'Bajada de precio',
            ctaLabel: 'Comprar ahora',
            ctaUrl: options.productSlug
                ? `https://www.parragkgloves.es/product/${options.productSlug}`
                : 'https://www.parragkgloves.es/shop',
        }),
        payload: {
            event: 'price-drop',
            previousPrice: options.previousPrice,
            currentPrice: options.currentPrice,
            productSlug: options.productSlug || null,
        },
    });
}

export async function notifyExclusiveCoupon(options: {
    eventKey: string;
    couponCode: string;
    description?: string | null;
    userIds: string[];
}): Promise<void> {
    if (options.userIds.length === 0) return;

    const safeCode = sanitizeNewsletterText(options.couponCode.toUpperCase());
    const subject = `Tu cupón exclusivo: ${safeCode}`;
    const message = options.description
        ? sanitizeNewsletterText(options.description)
        : `Hemos creado este cupón exclusivamente para ti. Úsalo en tu próxima compra.`;

    const htmlContent = buildBroadcastEmailHtml({
        title: 'Tienes un cupón exclusivo',
        message,
        badge: 'Solo para ti',
        code: safeCode,
        ctaLabel: 'Ir a la tienda',
        ctaUrl: 'https://www.parragkgloves.es/shop',
    });

    for (const userId of options.userIds) {
        const { data: userRecord } = await supabaseAdmin.auth.admin.getUserById(userId);
        const email = userRecord?.user?.email;
        if (!email) continue;

        await enqueueNewsletterEmail({
            toEmail: email,
            eventKey: `${options.eventKey}:${userId}`,
            subject,
            htmlContent,
            payload: { event: 'exclusive-coupon', couponCode: safeCode, userId },
        });
    }

    await processNewsletterQueueBatch(options.userIds.length);
}
