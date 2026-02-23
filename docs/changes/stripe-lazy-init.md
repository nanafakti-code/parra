# Stripe Lazy Initialization

> **Fecha**: 2026-02-23  
> **Autor**: Equipo de desarrollo PARRA  
> **Archivos modificados**: `src/lib/stripe.ts`, `src/pages/api/stripe/create-session.ts`, `src/pages/api/stripe/webhook.ts`

---

## 🔍 Problema detectado

El módulo `src/lib/stripe.ts` inicializaba el cliente de Stripe **al momento de ser importado** mediante una constante global:

```typescript
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || import.meta.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

export const stripe = new Stripe(stripeSecretKey, { ... });
```

Cualquier archivo que importase este módulo — directa o indirectamente — ejecutaba la inicialización de forma inmediata. Si la variable `STRIPE_SECRET_KEY` no estaba definida, la aplicación **se detenía por completo** con un `throw` global, afectando incluso páginas que no utilizan Stripe (Home, Shop, Detalle de producto, etc.).

---

## ⚠️ Riesgo técnico anterior

| Riesgo | Severidad | Descripción |
|---|---|---|
| **Crash total de la aplicación** | 🔴 Crítica | Un solo `throw` al importar el módulo rompía toda la app, incluyendo páginas públicas sin relación con pagos. |
| **Dependencia de `process.env`** | 🟡 Media | Usar `process.env` en Astro SSR es inestable; `import.meta.env` es el mecanismo correcto en este entorno. |
| **Bloqueo de despliegue** | 🔴 Crítica | Si Vercel no tenía `STRIPE_SECRET_KEY` configurada, el despliegue devolvía HTTP 500 en **todas** las rutas, no solo en las de pago. |
| **Inicialización innecesaria** | 🟡 Media | El cliente de Stripe se creaba aunque la petición actual no lo necesitase, consumiendo recursos de forma prematura. |

---

## 🛠️ Solución aplicada

Se reemplazó la exportación directa de una instancia (`export const stripe`) por una función de inicialización lazy (`export function getStripe()`):

```typescript
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
    if (_stripe) return _stripe;

    const key = import.meta.env.STRIPE_SECRET_KEY;

    if (!key) {
        throw new Error(
            '[stripe] STRIPE_SECRET_KEY no está configurada. '
            + 'Añádela en .env o en las variables de entorno de Vercel.'
        );
    }

    _stripe = new Stripe(key, { apiVersion: '2025-04-30.basil' as any });
    return _stripe;
}
```

**Consumidores actualizados:**

- `create-session.ts`: `getStripe().checkout.sessions.create(...)`
- `webhook.ts`: `getStripe().webhooks.constructEvent(...)` y `getStripe().checkout.sessions.retrieve(...)`

---

## 🔐 Impacto en seguridad

| Aspecto | Antes | Después |
|---|---|---|
| **Exposición del error** | `throw` genérico visible en logs de producción | Mensaje descriptivo controlado, solo cuando se invoca una ruta de pago |
| **Superficie de ataque** | El fallo global podía revelar la ausencia de configuración al atacante | El error se confina a endpoints de Stripe; el resto de la app responde con normalidad |
| **Uso de `process.env`** | Acceso directo a variables del proceso (no recomendado en Astro) | Uso exclusivo de `import.meta.env`, alineado con el modelo de seguridad de Astro/Vite |

---

## 🚀 Impacto en estabilidad

| Métrica | Antes | Después |
|---|---|---|
| **Disponibilidad sin Stripe** | 0% — toda la app caía | 100% — solo fallan los endpoints de pago |
| **Tiempo de recuperación** | Requería configurar la variable y redesplegar | La app funciona inmediatamente; Stripe se activa al configurar la variable |
| **Instancias de Stripe creadas** | 1 global (al arrancar) | 1 lazy (al primer uso), reutilizada en llamadas posteriores (singleton) |

---

## 📌 Antes vs Después

### Antes (inicialización eager)

```
Servidor arranca
  └─ Importa stripe.ts
       └─ Lee STRIPE_SECRET_KEY
            ├─ ✅ Existe → crea instancia global
            └─ ❌ No existe → throw Error → APP MUERTA
                 └─ Home, Shop, Producto → HTTP 500
```

### Después (inicialización lazy)

```
Servidor arranca
  └─ Importa stripe.ts
       └─ Solo registra la función getStripe()
            └─ No lee variables, no crea instancia
                 └─ Home, Shop, Producto → ✅ Funcionan

Usuario llega a /checkout o Stripe envía webhook
  └─ Handler llama getStripe()
       └─ Lee STRIPE_SECRET_KEY
            ├─ ✅ Existe → crea instancia (se cachea)
            └─ ❌ No existe → Error 500 SOLO en ese endpoint
                 └─ Resto de la app → ✅ Sigue funcionando
```

---

*Documento generado como parte del proceso de estabilización y refactorización del proyecto PARRA.*
