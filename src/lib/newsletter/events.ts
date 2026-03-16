import { buildBroadcastEmailHtml } from './email';
import { enqueueNewsletterBroadcast } from './queue';
import { sanitizeNewsletterText } from './validation';

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
    const title = `Stock actualizado: ${sanitizeNewsletterText(options.productName)}`;
    const isRestock = options.previousStock <= 0 && options.currentStock > 0;

    const message = isRestock
        ? 'El producto ha vuelto a estar disponible. Si lo estabas esperando, este es el momento de comprarlo.'
        : 'Se actualizó el stock de un producto de la tienda.';

    await enqueueNewsletterBroadcast({
        eventKey: options.eventKey,
        eventType: 'stock-updated',
        subject: title,
        htmlContent: buildBroadcastEmailHtml({
            title,
            message,
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
    const title = `Nuevo cupón disponible: ${safeCode}`;

    const message = [
        `Ya puedes utilizar el cupón ${safeCode} en tu próxima compra.`,
        options.description ? sanitizeNewsletterText(options.description) : '',
    ].filter(Boolean).join('\n\n');

    await enqueueNewsletterBroadcast({
        eventKey: options.eventKey,
        eventType: 'coupon-created',
        subject: title,
        htmlContent: buildBroadcastEmailHtml({
            title,
            message,
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
            ctaLabel: options.ctaLabel || 'Descubrir campaña',
            ctaUrl: options.ctaUrl || 'https://www.parragkgloves.es/shop',
        }),
        payload: {
            event: 'campaign-launched',
        },
    });
}
