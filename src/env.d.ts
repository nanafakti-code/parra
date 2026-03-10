/// <reference types="astro/client" />

declare namespace App {
    interface Locals {
        user: {
            id: string;
            email?: string;
            [key: string]: any;
        } | null;
        role: string | null;
    }
}

// Global window properties set by inline scripts
interface Window {
    /** Stripe publishable key inyectada desde SSR via define:vars */
    STRIPE_PUBLIC_KEY: string | undefined;
    /** Stripe.js CDN constructor — cargado via <script src="https://js.stripe.com/v3/"> */
    Stripe: (publishableKey: string, options?: Record<string, unknown>) => {
        elements: (options: Record<string, unknown>) => {
            create: (type: string) => {
                mount: (selector: string) => void;
                on: (event: string, handler: (e: Record<string, unknown>) => void) => void;
            };
        };
        confirmPayment: (options: Record<string, unknown>) => Promise<{ error?: { message: string } }>;
    };
    /** Referencia al StripeElement activo en checkout (para validación previa al submit) */
    stripePaymentElement: unknown;
    /** Abre el cajón del carrito (definido en CartDrawer.astro) */
    openCart: () => void;
    /** Cierra el cajón del carrito (definido en CartDrawer.astro) */
    closeCart: () => void;
}
