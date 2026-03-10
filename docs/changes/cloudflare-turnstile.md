# Cloudflare Turnstile — Bot Protection en Checkout

## Implementación completada — 0 errores TS

---

### 1. Helper creado: `src/lib/security/verifyTurnstile.ts`

```typescript
export async function verifyTurnstile(token, remoteIp): Promise<boolean>
```

- POST a `https://challenges.cloudflare.com/turnstile/v0/siteverify` con `secret`, `response`, `remoteip`
- **Fail closed**: si `TURNSTILE_SECRET_KEY` no está configurada en producción → devuelve `false` (deniega)
- En modo `development` sin la clave → omite la verificación para no bloquear el entorno local
- Registra en `console.warn` los `error-codes` de Cloudflare cuando falla

---

### 2. Endpoints modificados

**`src/pages/api/stripe/create-payment-intent.ts`** — bloque añadido tras parsear el body:

```typescript
const { items, shippingInfo, email, couponCode, turnstileToken } = body;

// ── Turnstile bot protection ──────────────────────────────────────────────────
const turnstileValid = await verifyTurnstile(turnstileToken, ip);
if (!turnstileValid) {
    console.warn('[create-payment-intent] Turnstile verification failed. IP:', ip);
    return jsonResponse({ error: 'Bot verification failed.' }, 403);
}
```

**`src/pages/api/stripe/create-session.ts`** — misma lógica, `turnstileToken` añadido a `SessionRequestBody`:

```typescript
const { items, shippingInfo, email, cartSessionId, couponCode, turnstileToken } = body;

// ── Turnstile bot protection ──────────────────────────────────────────────────
const turnstileValid = await verifyTurnstile(turnstileToken, ip);
if (!turnstileValid) {
    console.warn('[create-session] Turnstile verification failed. IP:', ip);
    return jsonResponse({ error: 'Bot verification failed.' }, 403);
}
```

---

### 3. Variables de entorno — `src/env.d.ts`

```typescript
interface ImportMetaEnv {
    readonly TURNSTILE_SECRET_KEY:      string;  // server-side (nunca exponer al cliente)
    readonly PUBLIC_TURNSTILE_SITE_KEY: string;  // cliente (prefijo PUBLIC_)
}
```

---

### 4. Cómo funciona la protección

| Paso | Actor | Detalle |
|---|---|---|
| 1 | Navegador | Cloudflare Turnstile renderiza el widget y genera un token único por sesión |
| 2 | Frontend | Incluye `turnstileToken` en el body del POST |
| 3 | Backend | Extrae el token y la IP antes de cualquier lógica de negocio |
| 4 | Backend → Cloudflare | POST a `siteverify` con `secret + token + remoteip` |
| 5 | Cloudflare | Verifica que el token fue generado por un humano real en tu dominio |
| 6a | Válido | Continúa el flujo normal (rate limit → DB prices → Stripe) |
| 6b | Inválido | HTTP 403 `{ error: "Bot verification failed." }` — no se crea PI ni Session, se loguea la IP |

**Orden de defensas en el flujo post-implementación:**

```
IP extract → Rate limit → Turnstile verify → Qty validate → DB prices → Coupon validate → Stripe API
```

---

### 5. Pasos pendientes

#### 5.1 Crear el sitio en Cloudflare

1. Ir a [https://dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile**
2. Crear un nuevo sitio, seleccionar el dominio de producción
3. Copiar la **Site Key** (pública) y la **Secret Key** (privada)

#### 5.2 Variables de entorno

Añadir en `.env` local y en el dashboard de Vercel:

```env
TURNSTILE_SECRET_KEY=your_secret_key_here
PUBLIC_TURNSTILE_SITE_KEY=your_site_key_here
```

> ⚠️ `TURNSTILE_SECRET_KEY` nunca debe exponerse al cliente. Solo usar en el servidor.

#### 5.3 Integrar el widget en el frontend

En la página de checkout (`src/pages/checkout.astro`), añadir el script y el widget:

```html
<!-- Cargar el SDK de Turnstile -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<!-- Widget visible (o invisible) -->
<div
  class="cf-turnstile"
  data-sitekey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
  data-theme="light"
></div>
```

#### 5.4 Enviar el token en el fetch

Antes del submit del formulario, extraer el token y añadirlo al body:

```typescript
const turnstileToken =
    document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value;

const response = await fetch('/api/stripe/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        items,
        shippingInfo,
        email,
        couponCode,
        turnstileToken,   // ← añadir aquí
    }),
});
```

Lo mismo aplica para el fetch a `/api/stripe/create-session`.

---

### 6. Archivos modificados / creados

| Archivo | Acción |
|---|---|
| `src/lib/security/verifyTurnstile.ts` | ✅ Creado |
| `src/pages/api/stripe/create-payment-intent.ts` | ✅ Modificado |
| `src/pages/api/stripe/create-session.ts` | ✅ Modificado |
| `src/env.d.ts` | ✅ Modificado |
