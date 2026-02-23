/**
 * src/lib/stripe.ts
 *
 * Cliente de Stripe con inicialización lazy (singleton).
 * - Solo se ejecuta en entorno SSR (server-side).
 * - No rompe la app si STRIPE_SECRET_KEY no está configurada.
 * - El error solo se lanza al invocar getStripe(), no al importar.
 * - Tipado estricto, sin `as any`.
 * - Compatible con Astro 5 SSR + Vercel.
 */

import Stripe from 'stripe';

let _instance: Stripe | null = null;

/**
 * Devuelve una instancia de Stripe inicializada de forma lazy.
 *
 * - Primera llamada: lee la key, crea la instancia y la cachea.
 * - Llamadas posteriores: devuelve la instancia cacheada (singleton).
 * - Si falta la key o se ejecuta en el cliente, lanza un error descriptivo.
 *
 * @throws {Error} Si se invoca desde el navegador (client-side).
 * @throws {Error} Si STRIPE_SECRET_KEY no está definida.
 */
export function getStripe(): Stripe {
    if (!import.meta.env.SSR) {
        throw new Error(
            '[stripe] Este módulo es server-only. ' +
            'No puede ejecutarse en el navegador.',
        );
    }

    if (_instance) return _instance;

    const key: string | undefined = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

    if (!key) {
        throw new Error(
            '[stripe] STRIPE_SECRET_KEY no está configurada. ' +
            'Añádela en .env o en las variables de entorno de Vercel.',
        );
    }

    _instance = new Stripe(key, { apiVersion: '2026-01-28.clover' });
    return _instance;
}
