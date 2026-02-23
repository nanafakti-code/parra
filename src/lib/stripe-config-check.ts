/**
 * src/lib/stripe-config-check.ts
 *
 * Validación de configuración de Stripe antes de usarlo.
 * - Verifica que STRIPE_SECRET_KEY existe.
 * - Verifica que empieza por "sk_" (Secret Key).
 * - Detecta el error común de usar la Publishable Key en el backend.
 * - No hardcodea ninguna clave.
 *
 * Nota: En Astro SSR con output "server", las variables privadas (sin PUBLIC_)
 * pueden no estar disponibles en import.meta.env dentro de API routes.
 * Por eso se usa un fallback a process.env, que es el comportamiento
 * estándar del adapter de Vercel.
 */

/**
 * Lee STRIPE_SECRET_KEY de forma compatible con Astro SSR.
 * Prioriza import.meta.env; si no está, usa process.env como fallback
 * (necesario en API routes con el adapter de Vercel).
 */
function getStripeKey(): string | undefined {
    return import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
}

/**
 * Valida que la configuración de Stripe es correcta antes de crear una sesión.
 *
 * @throws {Error} Si se ejecuta en el cliente (no SSR).
 * @throws {Error} Si STRIPE_SECRET_KEY no está definida.
 * @throws {Error} Si se está usando una Publishable Key en lugar de una Secret Key.
 */
export function validateStripeConfig(): void {
    if (!import.meta.env.SSR) {
        console.error('[stripe-config] Intento de validación en el cliente.');
        throw new Error(
            '[stripe-config] La validación de Stripe solo puede ejecutarse en el servidor.',
        );
    }

    const key = getStripeKey();

    if (!key) {
        console.error('[stripe-config] STRIPE_SECRET_KEY no está definida.');
        throw new Error(
            '[stripe-config] STRIPE_SECRET_KEY no está configurada. ' +
            'Añádela en .env o en las variables de entorno de Vercel.',
        );
    }

    if (key.startsWith('pk_')) {
        console.error(
            '[stripe-config] Se detectó una Publishable Key (pk_) en STRIPE_SECRET_KEY. ' +
            'Esto es un error de configuración grave.',
        );
        throw new Error(
            '[stripe-config] STRIPE_SECRET_KEY contiene una Publishable Key (pk_...). ' +
            'El backend requiere una Secret Key (sk_...). ' +
            'Revisa tus variables de entorno.',
        );
    }

    if (!key.startsWith('sk_')) {
        console.error('[stripe-config] STRIPE_SECRET_KEY no tiene el prefijo esperado (sk_).');
        throw new Error(
            '[stripe-config] STRIPE_SECRET_KEY no parece ser una clave válida de Stripe. ' +
            'Debe comenzar con "sk_". Revisa tus variables de entorno.',
        );
    }

    console.log('[stripe-config] Configuración de Stripe validada correctamente.');
}
