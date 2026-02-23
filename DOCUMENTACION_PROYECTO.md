# PARRA — Documentación Completa del Proyecto

## 1. Descripción General

Tienda online de **guantes de portero** de la marca **PARRA**. Diseño oscuro, premium y deportivo. Permite a los usuarios navegar por el catálogo, añadir productos al carrito, registrarse/iniciar sesión, y pagar con Stripe Checkout.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| **Framework** | Astro (SSR) | ^5.17.1 |
| **UI Components** | Preact (compat mode) | ^10.28.4 |
| **Estilos** | Tailwind CSS | ^3.4.19 |
| **Base de datos** | Supabase (PostgreSQL) | @supabase/supabase-js ^2.97.0 |
| **Pagos** | Stripe Checkout | stripe ^20.3.1 |
| **Autenticación** | JWT custom (jsonwebtoken + bcryptjs) | N/A |
| **Hosting** | Vercel (adapter @astrojs/vercel) | ^9.0.4 |
| **Output mode** | `server` (SSR completo) | — |

---

## 3. Variables de Entorno Requeridas

```env
SUPABASE_URL=https://jboxsbtfhkanvnhxuxdd.supabase.co
SUPABASE_ANON_KEY=<tu_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<tu_service_role_key>
JWT_SECRET=super-secret-football-key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

> **IMPORTANTE**: Estas variables deben configurarse también en el panel de Vercel (Settings > Environment Variables) para que funcione en producción. Sin ellas, la web da error 500.

---

## 4. Estructura del Proyecto

```
src/
├── components/          # Componentes Astro reutilizables
│   ├── Benefits.astro       # Sección de beneficios/ventajas
│   ├── CartDrawer.astro     # Drawer lateral del carrito (slide-in)
│   ├── Footer.astro         # Pie de página
│   ├── GloveSelector.astro  # Selector interactivo de guantes
│   ├── Header.astro         # Navbar con búsqueda, usuario y carrito
│   ├── Hero.astro           # Sección hero de la home
│   ├── Newsletter.astro     # Formulario de newsletter
│   ├── ProductCard.astro    # Tarjeta de producto (grid de tienda)
│   └── Testimonials.astro   # Sección de testimonios
│
├── layouts/
│   └── Layout.astro         # Layout base (head, meta, fonts, scroll reveal)
│
├── lib/                 # Lógica de negocio del cliente/servidor
│   ├── auth.ts              # hashPassword, comparePassword, createToken, verifyToken
│   ├── cart.ts              # Gestión completa del carrito (localStorage + API)
│   ├── mock-data.ts         # Datos de prueba (NO se usa en producción)
│   ├── stripe.ts            # Inicialización del cliente Stripe
│   ├── supabase.ts          # Clientes Supabase (anon + admin/service_role)
│   └── toast.ts             # Sistema de toasts sin dependencias
│
├── pages/               # Páginas y API routes
│   ├── index.astro          # Home: Hero + Productos destacados + CTA
│   ├── shop.astro           # Tienda: grid filtrable por categoría
│   ├── product/[slug].astro # Detalle de producto (galería, tallas, add to cart)
│   ├── cart.astro           # Página completa del carrito
│   ├── checkout.astro       # Formulario de checkout (datos de envío)
│   ├── success.astro        # Confirmación post-pago
│   ├── cancel.astro         # Pago cancelado
│   ├── login.astro          # Formulario de login
│   ├── register.astro       # Formulario de registro
│   ├── profile.astro        # Mi cuenta (datos, pedidos)
│   ├── admin/index.astro    # Panel de administración
│   │
│   └── api/                 # API Routes (serverless functions)
│       ├── auth/login.ts        # POST: login con email/password
│       ├── auth/register.ts     # POST: registro de usuario
│       ├── auth/logout.ts       # POST: logout (borra cookie)
│       ├── cart.ts              # GET/POST: carrito del usuario logueado (BD)
│       ├── cart/reserve.ts      # POST/DELETE: reserva de stock
│       ├── cart/merge.ts        # POST: fusionar carrito invitado → usuario
│       ├── orders.ts            # POST: crear orden desde carrito (BD)
│       ├── stripe/create-session.ts  # POST: crear Stripe Checkout Session
│       └── stripe/webhook.ts        # POST: webhook de Stripe (procesar pago)
│
├── styles/
│   └── global.css           # Variables CSS, tema oscuro, animaciones
│
database/
├── schema.sql               # Schema principal de la BD
└── schema_additions.sql     # Tablas/funciones adicionales
```

---

## 5. Base de Datos (Supabase / PostgreSQL)

### 5.1 Tablas Principales

| Tabla | Descripción |
|---|---|
| `users` | Usuarios (customer/admin). Campos: id, name, email, password (bcrypt), role, phone, avatar_url, is_active |
| `categories` | Categorías de productos. Campos: id, name, slug, description, image_url, display_order, is_active |
| `products` | Productos. Campos: id, name, slug, description, short_description, price, compare_price, cost, category_id, image, stock, sku, brand, is_featured, is_active, meta_title, meta_description |
| `product_images` | Galería de imágenes por producto. Campos: id, product_id, url, alt_text, display_order |
| `product_variants` | Tallas/variantes. Campos: id, product_id, size, stock, sku, price_override, is_active |
| `addresses` | Direcciones de envío del usuario |
| `carts` | Carrito del usuario logueado (1 carrito por usuario) |
| `cart_items` | Ítems del carrito (product_id, variant_id, quantity) |
| `coupons` | Cupones de descuento (porcentaje o fijo) |
| `coupon_usage` | Tracking de uso de cupones (1 uso por usuario) |
| `orders` | Pedidos. Campos: id, user_id, order_number (auto-generado EG-0000001), status, subtotal, discount, shipping_cost, total, shipping info, tracking |
| `order_items` | Ítems de cada pedido (snapshot de nombre, imagen, precio) |
| `reviews` | Reseñas de productos (rating 1-5, con aprobación de admin) |

### 5.2 Enums

- `user_role`: `customer`, `admin`
- `order_status`: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded`

### 5.3 Funciones / Triggers

- `generate_order_number()`: Trigger que auto-genera el campo `order_number` con formato `EG-XXXXXXX`
- `decrement_stock(row_id, amount)`: RPC para decrementar stock atómicamente (usada en el webhook de Stripe)

### 5.4 RLS (Row Level Security)

- RLS está **habilitado** en todas las tablas pero con políticas **"Allow all"** (permisivas) para desarrollo.
- **⚠️ PROBLEMA DE SEGURIDAD**: En producción se deben crear políticas restrictivas.

---

## 6. Funcionalidades Implementadas

### 6.1 Página de Inicio (`index.astro`)
- **Hero** con imagen de fondo (URL de Instagram), título animado y CTA
- **Productos Destacados**: Grid de 4 productos (`is_featured = true`) con tarjetas estilizadas
- **Beneficios** (`Benefits.astro`): Iconos con ventajas de la marca
- **Selector de Guantes** (`GloveSelector.astro`): Componente interactivo
- **Testimonios** (`Testimonials.astro`): Carrusel de opiniones
- **CTA Banner**: Banner con parallax y call to action
- **Newsletter** (`Newsletter.astro`): Formulario de suscripción

### 6.2 Tienda (`shop.astro`)
- Grid de productos desde Supabase
- Filtrado por categorías (Elite, Entrenamiento, Infantil, Accesorios)
- Cada tarjeta (`ProductCard.astro`) muestra: imagen, categoría, nombre, precio, descuento, badge "PRO"
- Click redirige a la página de detalle

### 6.3 Detalle de Producto (`product/[slug].astro`)
- Galería de imágenes (imagen principal + `product_images`)
- Selector de talla (`product_variants`)
- Selector de cantidad con validación de stock
- Botón "Añadir al carrito" que llama a `lib/cart.ts`
- Descripción del producto

### 6.4 Carrito
- **Carrito de invitados**: Se guarda en `localStorage` (clave `parra_cart`)
- **Carrito de usuarios logueados**: Se guarda en BD (tablas `carts` + `cart_items`)
- **CartDrawer** (`CartDrawer.astro`): Drawer lateral slide-in con animación
- **Página de carrito** (`cart.astro`): Vista completa con modificación de cantidades
- **Reserva de stock** (`api/cart/reserve.ts`): Verifica stock físico antes de añadir
- **Merge de carritos** (`api/cart/merge.ts`): Al hacer login, fusiona el carrito de invitado con el del usuario
- **Evento reactivo**: `cart:updated` dispara actualización del badge del header en tiempo real
- **Toast notifications**: Feedback visual al añadir/eliminar productos

### 6.5 Checkout y Pagos
- **Formulario de checkout** (`checkout.astro`): Datos de envío (nombre, dirección, teléfono, email)
- **Stripe Checkout** (`api/stripe/create-session.ts`):
  - Valida precios contra la BD (nunca confía en el frontend)
  - Verifica stock disponible
  - Crea sesión de Stripe Checkout con `line_items`
  - Redirige a Stripe para el pago
- **Webhook** (`api/stripe/webhook.ts`):
  - Escucha `checkout.session.completed`
  - Crea la orden en Supabase (`orders` + `order_items`)
  - Decrementa stock atómicamente con `decrement_stock` RPC
  - Limpia reservas de stock
- **Páginas post-pago**: `success.astro` y `cancel.astro`

### 6.6 Autenticación
- **Registro** (`register.astro` + `api/auth/register.ts`): Nombre + email + password → hash bcrypt → insert en `users`
- **Login** (`login.astro` + `api/auth/login.ts`): Email + password → compare bcrypt → JWT cookie (`auth_token`, httpOnly, 7 días)
- **Logout** (`api/auth/logout.ts`): Borra la cookie `auth_token`
- **Perfil** (`profile.astro`): Muestra datos del usuario y historial de pedidos

### 6.7 Panel de Admin (`admin/index.astro`)
- Dashboard básico de administración
- Solo accesible para usuarios con `role = 'admin'`

### 6.8 UI/UX
- **Modo oscuro permanente** (clase `dark` siempre activa)
- **Tipografía**: Oswald (headings) + Inter (body) via Google Fonts
- **Scroll reveal**: Animaciones de aparición al hacer scroll (IntersectionObserver)
- **Cart bounce**: Animación del icono del carrito al añadir productos
- **Toasts**: Sistema de notificaciones custom (success, error, warning, info) sin dependencias
- **View Transitions**: Astro Client Router para transiciones suaves entre páginas

---

## 7. Problemas Conocidos y Deuda Técnica

### 7.1 Errores Críticos

| # | Problema | Archivo | Descripción |
|---|---|---|---|
| 1 | **Stripe crash sin STRIPE_SECRET_KEY** | `lib/stripe.ts` | Si falta la variable, hace `throw new Error()` que rompe TODA la aplicación, incluso páginas que no usan Stripe. Debería ser lazy initialization. |
| 2 | **Webhook usa RPC inexistente** | `api/stripe/webhook.ts` | Llama a `decrement_stock` RPC y `stock_reservations` table que pueden no existir en Supabase. |
| 3 | **Orders API usa schema incompleto** | `api/orders.ts` | Inserta en `orders` sin `order_number`, `subtotal`, `shipping_name`, etc. que son campos requeridos en el schema. El status es 'PENDING' (string) pero el enum es 'pending'. |
| 4 | **Cart merge usa RPC inexistente** | `api/cart/merge.ts` | Llama a `transfer_guest_cart_to_user` RPC que no existe en la BD. |
| 5 | **Auth usa `process.env` inconsistente** | `lib/auth.ts` | Usa `process.env.JWT_SECRET` en vez de `import.meta.env` (Astro). Puede fallar en Vercel. |

### 7.2 Problemas de Seguridad

| # | Problema | Descripción |
|---|---|---|
| 1 | **RLS permisivo** | Todas las tablas tienen políticas "Allow all". Cualquiera puede leer/escribir cualquier dato. |
| 2 | **Passwords en texto plano en BD** | Se usa bcrypt para hash, pero el campo `password` se selecciona con `SELECT *`, exponiendo el hash al frontend en el login (no se filtra). |
| 3 | **JWT Secret hardcoded** | El fallback `'super-secret-football-key'` está en el código fuente. |
| 4 | **No hay rate limiting** | Las APIs de auth no tienen protección contra fuerza bruta. |
| 5 | **No hay CSRF protection** | Las cookies de sesión no tienen protección CSRF. |
| 6 | **Admin sin middleware** | El panel admin (`admin/index.astro`) no tiene un middleware de Astro que valide el token antes de renderizar. |

### 7.3 Inconsistencias de Lógica

| # | Problema | Descripción |
|---|---|---|
| 1 | **Doble sistema de carrito** | Hay dos APIs: `api/cart.ts` (usuario logueado, BD) y `api/cart/reserve.ts` (reservas). No están bien conectadas. |
| 2 | **Stock no se sincroniza** | El carrito de localStorage guarda `stock` como snapshot al añadir. Si el stock cambia, no se actualiza. |
| 3 | **Imágenes de producto externas** | Se usan URLs de Instagram que expiran. Deberían subirse a Supabase Storage o Cloudinary. |
| 4 | **No hay validación de email** | El registro no verifica que el email sea válido ni envía confirmación. |
| 5 | **No hay recuperación de contraseña** | No existe flujo de "olvidé mi contraseña". |

---

## 8. Categorías en la BD

| Nombre | Slug |
|---|---|
| Elite | `elite` |
| Entrenamiento | `entrenamiento` |
| Infantil | `infantil` |
| Accesorios | `accesorios` |

---

## 9. Productos Actuales

Actualmente hay al menos 2 productos:
1. **PARRA Kids** (slug: `parra-kids`) — Categoría: Infantil — Precio: €49.99 — Tallas: 4-8
2. **PARRA Classic Pro** (slug: `parra-classic-pro`) — Categoría: Elite — Precio: €79.99

---

## 10. Flujo de Compra Actual

```
1. Usuario navega Shop/Home
2. Click en producto → Detalle (/product/[slug])
3. Selecciona talla y cantidad
4. Click "Añadir al carrito"
   → lib/cart.ts: addItem()
   → POST /api/cart/reserve (verifica stock)
   → Guarda en localStorage
   → Dispara evento cart:updated
   → Badge del header se actualiza
5. Va al carrito (/cart)
6. Click "Proceder al pago" → /checkout
7. Rellena datos de envío
8. Click "Pagar"
   → POST /api/stripe/create-session
   → Valida precios contra BD
   → Crea Stripe Checkout Session
   → Redirect a stripe.com
9. Pago completado → Stripe webhook
   → POST /api/stripe/webhook
   → Crea orden en BD
   → Decrementa stock
   → Redirect a /success
```

---

## 11. Comandos

```bash
# Desarrollo
npm run dev

# Build
npm run build

# Preview
npm run preview
```

---

## 12. Deploy en Vercel

- Adapter: `@astrojs/vercel`
- Output: `server` (SSR)
- Variables de entorno: Deben configurarse en Vercel > Settings > Environment Variables
- Después de añadir/modificar variables: **hacer Redeploy**

---

## 13. Recomendaciones para la Reconstrucción

1. **Stripe lazy init**: No inicializar Stripe al importar el módulo. Inicializarlo solo cuando se necesite (en las rutas de checkout/webhook).
2. **Eliminar RPCs inexistentes**: Reemplazar `decrement_stock`, `transfer_guest_cart_to_user` por queries directas o crear las funciones en Supabase.
3. **Unificar sistema de carrito**: Decidir si usar solo localStorage (invitados) o solo BD (usuarios), y tener un flujo claro de merge al login.
4. **RLS real**: Implementar políticas de seguridad reales en producción.
5. **Subir imágenes a Cloudinary/Supabase Storage**: No depender de URLs de Instagram.
6. **Middleware de Astro para admin**: Crear `src/middleware.ts` que proteja rutas `/admin/*`.
7. **Variables de entorno consistentes**: Usar siempre `import.meta.env` en Astro, nunca `process.env` directamente.
8. **Validación de inputs**: Añadir validación server-side para todos los endpoints.
