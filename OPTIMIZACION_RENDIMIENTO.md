# Optimización de Rendimiento — Parra GK Gloves

**Fecha:** 2026-03-14
**Objetivo:** Core Web Vitals: LCP < 2.5 s · INP < 200 ms · CLS < 0.1

---

## Resumen de Cambios

| # | Categoría | Archivo(s) | Mejora estimada |
|---|-----------|------------|-----------------|
| 1 | Caché servidor | `middleware.ts` | −1 DB query/req en producción |
| 2 | Consultas paralelas | `index.astro`, `checkout.astro` | −50–100 ms TTFB |
| 3 | Caché de marca | `lib/brand.ts` + layouts | −2 DB queries/req |
| 4 | Scripts no bloqueantes | `AdminLayout.astro` | −300–500 ms FCP admin |
| 5 | Chart.js diferido | `admin/index.astro` | −220 KB bloqueo render |
| 6 | Cloudinary bajo demanda | `profile.astro` | −150 KB en carga inicial |
| 7 | Preconnect CDN | `Layout.astro`, `AdminLayout.astro` | −100–200 ms latencia CDN |
| 8 | LCP product image | `product/[slug].astro` | Mejora LCP score |
| 9 | Cart API (1 query) | `api/cart.ts` | −1 DB round-trip |
| 10 | DB indexes nuevos | `database/migrations/` | −seq scans en tablas clave |

---

## Detalle por Área

### 1. Caché de Configuración en Middleware (`src/middleware.ts`)

**Problema:** La comprobación de modo mantenimiento hacía 1 consulta a `site_settings` en **cada petición** al servidor, sin caché.

**Solución:**
- `_maintenanceCache` a nivel de módulo con TTL de 60 s.
- `Promise.all([authValidation, getMaintenanceSetting()])` para paralelizar autenticación y mantenimiento.

**Impacto:** En producción, la consulta de mantenimiento se ejecuta 1 vez/minuto en lugar de en cada request.

---

### 2. Consultas Paralelas en Páginas SSR

**Problema:** `index.astro` hacía 2 consultas secuenciales (sections → products). `checkout.astro` hacía 2 secuenciales (addresses → shipping).

**Solución:** `Promise.all([query1, query2])` en ambas páginas.

**Impacto estimado:** −50 a −100 ms de TTFB por carga de página.

---

### 3. Caché de Configuración de Marca (`src/lib/brand.ts`)

**Problema:** `Layout.astro`, `Header.astro` y `AdminLayout.astro` consultaban `site_settings` de forma independiente en cada render. En una página con header + layout = **2 queries redundantes** por request.

**Solución:** Módulo `brand.ts` con caché de 5 minutos compartido entre layouts y componentes.

**Impacto:** 0–1 ms para hits de caché vs. 20–50 ms de round-trip a Supabase.

---

### 4. Scripts No Bloqueantes en Admin (`src/layouts/AdminLayout.astro`)

**Problema:**
- `feather-icons` se cargaba con `<script src>` síncrono en `<head>` → bloqueaba el parser.
- Google Fonts con `<link rel="stylesheet">` → renderiza-bloqueante.

**Solución:**
- feather-icons: carga dinámica IIFE con `s.onload = () => feather.replace()`.
- Google Fonts: patrón `rel="preload" as="style" onload="this.rel='stylesheet'"`.

**Impacto:** En redes lentas, elimina 300–500 ms de bloqueo de FCP en todas las páginas del admin.

---

### 5. Chart.js Diferido (`src/pages/admin/index.astro`)

**Problema:** Chart.js (~220 KB minificado) se cargaba con `<script src>` síncrono bloqueando el parser justo antes de los gráficos.

**Solución:** IIFE que inyecta `<script>` dinámicamente; toda la inicialización se mueve a `s.onload`.

**Impacto:** El dashboard muestra KPIs y tablas de inmediato; los gráficos aparecen cuando el script termina de cargar (no bloquea la pintura inicial).

---

### 6. Cloudinary Widget Bajo Demanda (`src/pages/profile.astro`)

**Problema:** El widget de Cloudinary (~150 KB+) se cargaba en cada visita al perfil, aunque el usuario nunca llegase a la pestaña de devoluciones.

**Solución:** Se eliminó el `<script src>` estático. El script se inyecta dinámicamente la primera vez que el usuario pulsa el botón de subir imágenes.

**Impacto:** −150 KB de descarga en carga inicial para todos los usuarios del perfil.

---

### 7. `preconnect` para CDNs (`src/layouts/Layout.astro`, `AdminLayout.astro`)

**Problema:** La primera petición a `res.cloudinary.com` y a `*.supabase.co` pagaba el coste completo de DNS + TCP + TLS.

**Solución:**
```html
<link rel="preconnect" href="https://res.cloudinary.com" crossorigin />
<link rel="preconnect" href="https://jboxsbtfhkanvnhxuxdd.supabase.co" crossorigin />
```

**Impacto:** −100–200 ms en la primera petición a Cloudinary/Supabase por visita nueva.

---

### 8. Optimización LCP en Página de Producto (`src/pages/product/[slug].astro`)

**Problema:** La imagen principal del producto (LCP candidate) no tenía prioridad de carga. Las miniaturas se cargaban con la misma prioridad.

**Solución:**
- Imagen principal: `fetchpriority="high" loading="eager"`.
- Miniaturas: `loading="lazy"`.

**Impacto:** El navegador descarga la imagen principal primero → mejora directa del LCP score.

---

### 9. Cart GET API — 1 Round-Trip (`src/pages/api/cart.ts`)

**Problema:** GET /api/cart hacía 2 consultas secuenciales: primero obtenía el cart, luego los items.

**Solución:** Una sola consulta con nested select:
```typescript
supabase
  .from('carts')
  .select('id, cart_items(*, products(*))')
  .eq('user_id', user.id)
  .maybeSingle()
```

**Impacto:** −1 round-trip a Supabase en cada carga de carrito autenticado.

---

### 10. Índices de Base de Datos

**Archivo:** `database/migrations/performance-query-indexes.sql`

Índices añadidos:

| Tabla | Columna(s) | Consulta beneficiada |
|-------|-----------|----------------------|
| `addresses` | `(user_id)` | Checkout, perfil |
| `orders` | `(created_at DESC)` | Dashboard admin |
| `orders` | `(user_id, created_at DESC)` | Perfil — mis pedidos |
| `products` | `(is_active, category_id)` | Tienda — filtro categoría |
| `products` | `(is_active, is_featured)` | Home — productos destacados |
| `products` | `(is_active, display_order)` | Home — orden de visualización |
| `page_sections` | `(page_name, display_order)` | Home — secciones ordenadas |
| `coupon_usage` | `(user_id)` | Checkout — validar cupón |
| `reviews` | `(user_id)` | Perfil — reseñas |
| `reviews` | `(product_id)` | Página de producto — reseñas |

> **Nota:** Ejecutar esta migración en el panel SQL de Supabase. Los índices usan `IF NOT EXISTS` por lo que son seguros de re-ejecutar.

---

## Pendientes Opcionales (post-publicación)

- **Astro Image** (`@astrojs/image`): optimizar imágenes de componentes Astro con WebP y dimensiones explícitas para evitar CLS.
- **ISR / stale-while-revalidate**: para las páginas de producto y tienda con cache en CDN.
- **Bundle splitting**: revisar si algún componente de cliente importa dependencias grandes innecesariamente.
- **`dns-prefetch`** adicional para `fonts.googleapis.com` si se decide mantener Google Fonts en public pages.
