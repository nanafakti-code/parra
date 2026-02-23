/**
 * src/lib/stripe-config-check.ts
 *
 * Validación de configuración de Stripe antes de usarlo.
 * - Verifica que STRIPE_SECRET_KEY existe.
 * - Verifica que empieza por "sk_" (Secret Key).
 * - Detecta el error común de usar la Publishable Key en el backend.
 * - No hardcodea ninguna clave.
 * - Solo usa import.meta.env.
 */

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

    const key: string | undefined = import.meta.env.STRIPE_SECRET_KEY;

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
