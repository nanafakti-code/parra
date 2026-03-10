# SECURITY AUDIT REPORT
## Parra GK Gloves — E-Commerce Platform
**Fecha de auditoría:** 10 de marzo de 2026  
**Estándar aplicado:** OWASP Top 10, OWASP ASVS, Secure SaaS Practices  
**Scope:** Código fuente completo, arquitectura, configuración, integraciones  
**Auditor:** Senior Cybersecurity Engineer / Application Security Auditor  

---

## 1. RESUMEN EJECUTIVO DE SEGURIDAD

### Clasificación general

> **🟠 RIESGO MEDIO — Requiere mejoras antes de producción a escala**

La plataforma presenta una arquitectura de seguridad **sólida y bien pensada** para su escala, con protecciones correctas en las áreas más críticas: validación de precios en backend, firma de webhooks de Stripe, cookies httpOnly, doble verificación de permisos de administrador y políticas RLS en la base de datos. Sin embargo, existen **vulnerabilidades concretas y configuraciones ausentes** que deben resolverse antes de operar con tráfico real, pagos reales y datos de usuarios reales.

### Puntuación por área

| Área | Puntuación | Observación |
|---|---|---|
| Autenticación | 7/10 | Buena base, faltan rate limiting y token rotation |
| Autorización / Admin | 8/10 | Doble verificación correcta, sin RBAC fino |
| Pagos / Stripe | 8/10 | Precios validados en backend; falta idempotencia en PI |
| Seguridad de API | 6/10 | Faltan rate limiting y validación de tipos |
| Cabeceras HTTP | 3/10 | Prácticamente ninguna cabecera de seguridad |
| Exposición de info | 5/10 | Debug endpoint público, stack traces en /merge |
| Configuración | 6/10 | CSRF protection deshabilitado explícitamente |
| Base de datos / RLS | 8/10 | Bien configurado, mejoras menores |
| Dependencias | 7/10 | Paquetes actuales, `jsonwebtoken` sin uso aparente |

---

## 2. VULNERABILIDADES ENCONTRADAS

---

### [CRIT-01] Endpoint de diagnóstico público sin autenticación

**Tipo:** Information Disclosure / Security Misconfiguration  
**Archivo:** `src/pages/api/debug-maintenance.ts`  
**Severidad:** 🔴 CRÍTICA  

**Código afectado:**
```typescript
export const GET: APIRoute = async ({ request }) => {
    results.envMaintenanceMode = import.meta.env.MAINTENANCE_MODE ?? 'NOT SET';
    results.supabaseUrl = import.meta.env.SUPABASE_URL ? 'SET' : 'NOT SET';
    results.supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET';
    results.supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET';
    // ...retorna todo el contenido de site_settings
    results.allSettings = data; // TODOS los ajustes del sitio
```

**Explicación:**  
El endpoint `GET /api/debug-maintenance` es completamente público — cualquier visitante puede acceder a él sin autenticación. Expone el estado de variables de entorno críticas (`SUPABASE_SERVICE_ROLE_KEY`), el contenido completo de la tabla `site_settings`, nombre del hostname y lógica interna del sistema de mantenimiento. El propio comentario del código dice "ELIMINAR después de resolver el problema" pero sigue existiendo en el repositorio.

**Escenario de explotación:**  
Un atacante visita `https://parragkgloves.es/api/debug-maintenance` y obtiene:
- Confirmación de qué claves están configuradas
- Valores reales de `site_settings` (pueden incluir configuraciones sensibles)
- Información de infraestructura que facilita ataques de reconocimiento

**Impacto real:** Reconocimiento de infraestructura y filtración de configuración interna del sistema.

---

### [CRIT-02] CSRF protection deshabilitado explícitamente

**Tipo:** Cross-Site Request Forgery (CSRF)  
**Archivo:** `astro.config.mjs`  
**Severidad:** 🔴 CRÍTICA  

**Código afectado:**
```javascript
security: {
    checkOrigin: false,  // CSRF protection DESHABILITADO
},
```

**Explicación:**  
Astro 5 incluye protección CSRF nativa mediante `checkOrigin: true` por defecto en modo SSR. Sin embargo, la configuración lo deshabilita explícitamente con `checkOrigin: false`. Esto permite que sitios externos realicen solicitudes POST a cualquier endpoint de la API con las cookies de sesión del usuario.

**Escenario de explotación:**  
1. Un atacante crea una página web maliciosa con un formulario oculto apuntando a `POST /api/auth/update-profile` o `POST /api/auth/save-address`.
2. La víctima, que tiene sesión activa en parragkgloves.es, visita la página maliciosa.
3. El formulario se envía automáticamente con las cookies de sesión (`sameSite: lax` no protege en navegación de primer nivel desde otro sitio).
4. El atacante puede cambiar el nombre, teléfono o dirección de entrega de la víctima sin su conocimiento.

**Impacto real:** Cambio fraudulento de datos de perfil, cambio de dirección de entrega antes de un pago, posible fraude en pedidos.

---

### [HIGH-01] Stack trace expuesto en endpoint de carrito

**Tipo:** Information Disclosure  
**Archivo:** `src/pages/api/cart/merge.ts`  
**Severidad:** 🟠 ALTA  

**Código afectado:**
```typescript
} catch (err: any) {
    return new Response(JSON.stringify({
        error: 'Error interno del servidor',
        message: err.message,    // mensaje de error interno
        stack: err.stack         // STACK TRACE COMPLETO expuesto
    }), { status: 500 });
}
```

**Explicación:**  
En caso de error interno, el endpoint `POST /api/cart/merge` devuelve el `stack` completo de la excepción al cliente. Los stack traces revelan rutas internas del sistema de archivos, versión exacta del runtime, nombres de módulos internos y estructura del proyecto — información valiosa para un atacante.

**Escenario de explotación:**  
Un atacante envía payloads malformados a `/api/cart/merge` para provocar excepciones y obtener información sobre la arquitectura interna del servidor.

**Impacto real:** Facilita el reconocimiento profundo del servidor para preparar ataques dirigidos más sofisticados.

---

### [HIGH-02] Sin rate limiting en endpoints de autenticación

**Tipo:** Brute Force / Credential Stuffing  
**Archivos:** `src/pages/api/auth/login.ts`, `src/pages/api/admin/login.ts`  
**Severidad:** 🟠 ALTA  

**Código afectado:**
```typescript
// login.ts — sin ningún tipo de limitación de intentos
export const POST: APIRoute = async ({ request, cookies }) => {
    const { email, password } = body;
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
    });
```

**Explicación:**  
No existe ningún mecanismo de rate limiting en los endpoints de login (ni de usuario ni de administrador). Supabase Auth tiene protecciones básicas propias, pero estas pueden ser insuficientes o evitables según la configuración del proyecto Supabase. La ausencia de rate limiting a nivel de aplicación significa que un atacante puede realizar miles de intentos de login por minuto.

**Escenario de explotación:**  
1. Un atacante obtiene una lista de emails de clientes (por ejemplo, mediante enumeración de usuarios o una brecha anterior).
2. Ejecuta un ataque de credential stuffing: prueba contraseñas de brechas conocidas contra cada email.
3. Sin throttling, puede probar miles de combinaciones en minutos.

**Impacto real:** Compromiso de cuentas de clientes, acceso a datos personales, historial de pedidos y potencial fraude en pedidos.

---

### [HIGH-03] Sin rate limiting en endpoint de creación de pagos

**Tipo:** Resource Exhaustion / Abuse  
**Archivo:** `src/pages/api/stripe/create-payment-intent.ts`, `src/pages/api/stripe/create-session.ts`  
**Severidad:** 🟠 ALTA  

**Explicación:**  
Los endpoints de creación de PaymentIntent y Checkout Session no tienen ningún límite de uso. Un atacante puede llamarlos en bucle para:
- Generar miles de PaymentIntents en Stripe (cada uno tiene un coste mínimo y consume cuotas de la API)
- Causar alertas de fraude en la cuenta Stripe del comerciante
- Realizar card testing (prueba de tarjetas robadas en pequeñas cantidades)

**Escenario de explotación:**  
Un bot envía peticiones masivas a `POST /api/stripe/create-payment-intent` con items del catálogo y luego intenta completar pagos con tarjetas robadas de pequeño importe para verificar cuáles están activas.

**Impacto real:** Fraude con tarjetas de crédito robadas servido desde la plataforma, cierre de la cuenta Stripe por actividad fraudulenta, pérdida económica por chargebacks.

---

### [HIGH-04] Ausencia completa de cabeceras de seguridad HTTP

**Tipo:** Security Misconfiguration  
**Archivo:** `astro.config.mjs`, `src/layouts/Layout.astro`  
**Severidad:** 🟠 ALTA  

**Explicación:**  
La respuesta HTTP de la aplicación no incluye ninguna de las cabeceras de seguridad estándar:

| Cabecera | Estado | Riesgo |
|---|---|---|
| `Content-Security-Policy` | ❌ Ausente | XSS, code injection |
| `Strict-Transport-Security` (HSTS) | ❌ Ausente | Man-in-the-middle, downgrade attacks |
| `X-Frame-Options` | ❌ Ausente | Clickjacking |
| `X-Content-Type-Options` | ❌ Ausente | MIME sniffing |
| `Referrer-Policy` | ❌ Ausente | Fuga de URLs en referrer |
| `Permissions-Policy` | ❌ Ausente | Acceso a cámara, geolocalización, etc. |

**Escenario de explotación — Clickjacking:**  
Un atacante embebe la página de checkout de parragkgloves.es en un `<iframe>` invisible superpuesto sobre un texto atractivo. La víctima cree estar haciendo clic en "Aceptar oferta" pero en realidad está confirmando un pago en la tienda.

**Escenario de explotación — XSS:**  
Sin CSP, cualquier XSS exitoso tiene acceso completo al DOM, puede leer las cookies (si se obtiene acceso al `document.cookie` de cookies no marcadas como httpOnly), realizar peticiones autenticadas o redirigir al usuario.

**Impacto real:** Múltiples vectores de ataque activos en producción que son trivialmente explotables una vez se conoce la URL.

---

### [HIGH-05] Token de sesión no rotado — acceso de larga duración

**Tipo:** Session Management  
**Archivos:** `src/pages/api/auth/login.ts`, `src/pages/api/admin/login.ts`  
**Severidad:** 🟠 ALTA  

**Código afectado:**
```typescript
const cookieOptions = {
    maxAge: 60 * 60 * 24 * 7, // 7 días — idéntico para usuarios normales Y administradores
};
```

**Explicación:**  
El token de acceso (`sb-access-token`) se configura con un `maxAge` de 7 días, y esto es **igual para usuarios normales y para administradores**. Los tokens de sesión de administrador deberían tener una vida máxima mucho más corta (1-4 horas) y requerir re-autenticación para operaciones críticas. Adicionalmente, no hay mecanismo de revocación de tokens activos ante sospecha de compromiso (aunque el endpoint de logout llama a `admin.signOut`, no queda constancia de todos los tokens activos).

**Impacto real:** Si un administrador olvida cerrar sesión en un dispositivo compartido o si se filtra una cookie, el atacante tiene acceso de administrador pleno durante 7 días completos.

---

### [HIGH-06] Sin validación de tipo/formato estricta en APIs administrativas

**Tipo:** Mass Assignment / Input Validation  
**Archivos:** `src/pages/api/admin/products.ts`, `src/pages/api/admin/orders.ts`  
**Severidad:** 🟠 ALTA  

**Código afectado (products.ts):**
```typescript
const body = await request.json();
const { name, slug, description, shortDescription, price, comparePrice, 
        categoryId, image, stock, sku, brand, isFeatured, isActive, 
        metaTitle, metaDescription, variants, gallery } = body;
// No existe ningún schema de validación (zod, yup, etc.)
```

**Explicación:**  
Los endpoints de administración reciben objetos JSON arbitrarios y los desestructuran directamente sin validación de esquema. Si bien existe cierta validación de campos obligatorios individuales, no hay:
- Validación de tipos (un `price = "abc"` se convierte en `NaN` y se inserta en BD)
- Límites de longitud (una descripción de 10 MB podría procesarse)
- Validación de formato (una URL de imagen podría ser `javascript:alert(1)`)
- Protección contra campos inesperados en actualizaciones

**Escenario de explotación:**  
Un administrador comprometido (o un ataque XSS en el panel) podría insertar en `image` de un producto una URL de JavaScript que se renderize en el frontend, creando un XSS almacenado en la página de producto visible para todos los clientes.

**Impacto real:** XSS almacenado en páginas de producto, inserción de datos malformados en base de datos, posible escalada a compromiso de clientes.

---

### [MED-01] Idempotencia incompleta en confirm-payment-intent

**Tipo:** Race Condition / Double Payment  
**Archivo:** `src/pages/api/stripe/confirm-payment-intent.ts`  
**Severidad:** 🟡 MEDIA  

**Código afectado:**
```typescript
// No existe verificación de si este paymentIntentId ya fue procesado
const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
if (paymentIntent.status !== 'requires_capture') {
    return jsonResponse({ error: `Estado de pago inválido: ${paymentIntent.status}` }, 400);
}
// Se procede sin comprobar si ya existe una orden para este PI en BD
```

**Explicación:**  
El endpoint `confirm-payment-intent` verifica el estado del PaymentIntent en Stripe, pero **no verifica si ya existe una orden en la base de datos** para ese `paymentIntentId` antes de crear la orden. La comprobación es: "si el PI tiene estado `requires_capture`, crear orden y capturar". Si el endpoint es llamado dos veces simultáneamente (por ejemplo, doble clic del usuario, o un reintento de red), existe una ventana de race condition en la que:
1. Ambas peticiones ven el PI como `requires_capture`
2. Ambas llaman a la RPC para crear la orden
3. La RPC `checkout_reserve_stock_and_order` es atómica pero podría crear dos órdenes si no tiene constraint único en `payment_intent_id`

**Impacto real:** Potencial creación de órdenes duplicadas, doble captura del pago (que Stripe rechazaría en la segunda), confusión en el inventario.

---

### [MED-02] Validación de stock no atómica en create-payment-intent

**Tipo:** Race Condition / TOCTOU (Time-of-Check-Time-of-Use)  
**Archivo:** `src/pages/api/stripe/create-payment-intent.ts`  
**Severidad:** 🟡 MEDIA  

**Código afectado:**
```typescript
// CHECK (en create-payment-intent):
if (dbProduct.stock < item.quantity) {
    throw new Error(`Stock insuficiente para "${dbProduct.name}".`);
}
// ... [tiempo pasa hasta confirm-payment-intent]
// USE (en confirm-payment-intent, llamando a checkout_reserve_stock_and_order):
// El stock podría haberse agotado entre CHECK y USE
```

**Explicación:**  
La verificación de stock en `create-payment-intent` y la reserva real de stock en `confirm-payment-intent` son dos operaciones separadas. En un escenario de alta concurrencia (por ejemplo, una venta flash), múltiples usuarios pueden pasar la verificación inicial de stock simultáneamente, pero solo el primero en llegar a `checkout_reserve_stock_and_order` tendría stock. El resto vería su pago cancelado — comportamiento correcto pero no ideal en UX.

**Impacto real:** En condiciones normales de una pequeña tienda, el impacto es bajo. En una venta con alta concurrencia, puede haber pagos autorizados que se cancelen en el último momento, lo que genera una mala experiencia y posible desconfianza del cliente.

---

### [MED-03] Enumeración de usuarios por respuesta diferenciada

**Tipo:** User Enumeration  
**Archivo:** `src/pages/api/auth/register.ts`  
**Severidad:** 🟡 MEDIA  

**Código afectado:**
```typescript
if (authError.message.includes('already registered') || authError.code === '422') {
    return jsonResponse({ message: 'Error al completar el registro.' }, 400);
}
return jsonResponse({
    message: 'Error de Supabase Auth: ' + authError.message,  // EXPONE mensaje interno
    debug: authError  // EXPONE objeto de error completo
}, 500);
```

**Explicación:**  
Para errores del tipo "email ya registrado", la respuesta es genérica (`'Error al completar el registro.'`), lo cual es correcto. Sin embargo, para **otros tipos de errores** de Supabase Auth, se expone directamente el mensaje de error de Supabase y el objeto de error completo (`debug: authError`). Esto puede revelar información sobre la estructura interna de la autenticación y puede en determinados escenarios ayudar a enumerar cuentas bajo condiciones específicas.

Adicionalmente, el tiempo de respuesta puede ser diferente dependiendo de si el email existe o no, permitiendo enumeración por timing.

**Impacto real:** Filtración de mensajes de error internos; posible enumeración de usuarios en condiciones específicas.

---

### [MED-04] Sin validación de origen en confirm-order (Client-Callable)

**Tipo:** Insecure Direct Object Reference / Abuse  
**Archivo:** `src/pages/api/stripe/confirm-order.ts`  
**Severidad:** 🟡 MEDIA  

**Código afectado:**
```typescript
// Llamado desde el frontend del usuario
if (!sessionId || !sessionId.startsWith('cs_')) {
    return jsonResponse({ error: 'session_id inválido.' }, 400);
}
// Cualquier persona con un session_id puede desencadenar la creación de una orden
```

**Explicación:**  
El endpoint `POST /api/stripe/confirm-order` es invocado por el frontend cliente desde la página `/success`. Cualquier persona que conozca un `stripe_session_id` válido (de una sesión completada de Stripe) puede llamar a este endpoint repetidamente. El endpoint verifica con Stripe que el pago está completado y tiene protección de idempotencia (`email_sent = false`), pero:

1. Provoca requests innecesarios a Stripe API
2. Podría usarse para determinar si ciertos session_ids pertenecen a este comerciante (reconocimiento)
3. En un bug edge-case, podría enviarse el email de confirmación más de una vez si hay timing issues

**Impacto real:** Uso abusivo de la API de Stripe; en el peor caso, envío múltiple de emails de confirmación.

---

### [MED-05] Logging de información sensible en producción

**Tipo:** Sensitive Data Exposure / Security Logging  
**Archivos:** `src/pages/api/auth/login.ts`, `src/pages/api/admin/login.ts`, `src/middleware.ts`  
**Severidad:** 🟡 MEDIA  

**Código afectado:**
```typescript
// login.ts
console.log(`[login] Sesión iniciada para: ${user.email}`); // Email en logs

// admin/login.ts
await supabaseAdmin.from('admin_logs').insert({
    details: { email: email.trim() }, // Email almacenado en admin_logs
    ip_address: request.headers.get('x-forwarded-for') // IP sin sanitización
});

// middleware.ts
console.error('[middleware] auth.getUser error', e); // Error completo en logs
```

**Explicación:**  
Los logs de producción en Vercel (y otros entornos serverless) son persistentes y accesibles por el equipo técnico. Registrar emails directamente puede violar el RGPD (Reglamento General de Protección de Datos) en Europa, que exige minimización de datos en logs. Adicionalmente, la IP capturada desde `x-forwarded-for` no está sanitizada — en un entorno con múltiples proxies, este header puede contener múltiples IPs o incluso ser manipulado por el cliente para registrar IPs falsas (IP spoofing en logs).

**Impacto real:** Potencial incumplimiento del RGPD; logs manipulados que dificultan la auditoría forense.

---

### [MED-06] Falta validación de propiedad en ciertas rutas de órdenes

**Tipo:** Insecure Direct Object Reference (IDOR)  
**Archivo:** `src/pages/api/orders/invoice/[orderId].ts`  
**Severidad:** 🟡 MEDIA  

**Código afectado:**
```typescript
if (userEmail) {
    query = query.or(`user_id.eq.${authUser.id},email.ilike.${userEmail}`);
}
```

**Explicación:**  
La verificación de propiedad en el endpoint de factura usa `.ilike` (case-insensitive LIKE) con el email del usuario. Aunque esto es intencional para manejar variaciones de capitalización, el patrón `.ilike.user@email.com` sin wildcards equivale a una comparación exacta insensible a mayúsculas, lo que es correcto. Sin embargo, si existe algún bug en cómo Supabase interpreta el operador `ilike` con el parámetro pasado directamente (sin escapar caracteres como `%` y `_`), un email del tipo `%@gmail.com` podría matchear todos los pedidos de cualquier email de gmail.

El riesgo es bajo dado el contexto (el email viene del token validado del usuario), pero la práctica de usar `.ilike` en lugar de `.eq` (con `.lower()`) para comparaciones de email merece revisión.

---

### [MED-07] `checkOrigin: false` combinado con SameSite: Lax

**Tipo:** CSRF  
**Archivos:** `astro.config.mjs`, `src/pages/api/auth/login.ts`  
**Severidad:** 🟡 MEDIA  

**Explicación:**  
Las cookies de sesión usan `sameSite: 'lax'`, que normalmente proporciona protección contra CSRF en la mayoría de navegadores modernos. Sin embargo, `SameSite: Lax` no protege contra solicitudes cross-site de tipo POST desde formularios (navegación de primer nivel) ni protege en todos los escenarios cuando `checkOrigin: false` está activo (que elimina todas las verificaciones adicionales de origen que Astro realiza). La combinación de ambos crea un vector de ataque CSRF más amplio.

Adicionalmente, el endpoint de logout acepta peticiones `GET` (`export const GET: APIRoute`), lo que permite CSRF trivial de logout mediante un `<img src="/api/auth/logout">`.

---

### [LOW-01] Dependencias instaladas sin uso aparente (superficie de ataque innecesaria)

**Tipo:** Vulnerable and Outdated Components  
**Archivo:** `package.json`  
**Severidad:** 🔵 BAJA  

**Código afectado:**
```json
"jsonwebtoken": "^9.0.3",
"bcryptjs": "^3.0.3",
"nodemailer": "^8.0.1",
"@react-email/components": "^1.0.8",
"@react-email/render": "^2.0.4"
```

**Explicación:**  
El proyecto incluye dependencias que parecen no utilizarse en el código auditado:
- `jsonwebtoken` y `bcryptjs`: la autenticación se delega completamente a Supabase Auth; no se encontró uso de JWT manual ni bcrypt en el código.
- `nodemailer`: los emails se envían vía Resend; no se encontró uso de nodemailer activo.
- `@react-email/components` y `@react-email/render`: los emails se generan con HTML puro; estas librerías aparecen importadas en `package.json` pero no se encontraron usos en `src/lib/email/index.ts`.

Cada dependencia adicional es superficie de ataque potencial para vulnerabilidades en la cadena de suministro.

**Impacto real:** Si alguna de estas dependencias tiene una CVE, afectan al proyecto aunque no se usen activamente. Aumentan el tamaño del bundle de producción.

---

### [LOW-02] Falta validación del campo `image` como URL segura en productos

**Tipo:** Stored XSS (potencial) / Input Validation  
**Archivos:** `src/pages/api/admin/products.ts`  
**Severidad:** 🔵 BAJA  

**Código afectado:**
```typescript
if (updates.image !== undefined) updateData.image = updates.image;
// Sin validación de que es una URL HTTP/HTTPS válida
```

**Explicación:**  
El campo `image` de un producto se acepta y almacena sin verificar que sea una URL HTTP/HTTPS válida. Un administrador malintencionado (o comprometido) podría insertar `javascript:alert(document.cookie)` como URL de imagen. Si la imagen se renderiza con `src={produto.image}` directamente en el HTML sin sanitización adicional, esto crearía un XSS almacenado.

En Astro, los atributos de templates se escapan automáticamente en contexto HTML, pero si hay algún componente que use `innerHTML` o `set:html` con datos de imagen, el riesgo escala a crítico.

---

### [LOW-03] Cookie de sesión compartida entre usuario y admin sin separación

**Tipo:** Privilege Confusion  
**Archivos:** `src/pages/api/auth/login.ts`, `src/pages/api/admin/login.ts`  
**Severidad:** 🔵 BAJA  

**Explicación:**  
Ambos flujos de login (usuario normal y admin) usan las mismas cookies: `sb-access-token` y `sb-refresh-token`, con idénticas opciones. No existe separación entre la sesión de usuario y la sesión de administrador. Si un usuario tiene a la vez una sesión de cliente y una sesión de admin en el mismo navegador, la última sesión iniciada sobrescribe la anterior. Esta falta de separación, aunque funciona en la práctica actual, puede llevar a comportamientos inesperados en flujos concurrentes.

---

### [LOW-04] Error messages reveladores en endpoints internos

**Tipo:** Information Disclosure  
**Archivos:** `src/pages/api/admin/orders.ts` (search sanitization)  
**Severidad:** 🔵 BAJA  

**Código afectado:**
```typescript
// admin/orders.ts
const sanitized = search.replace(/[^a-zA-Z0-9\s@.\-_+]/g, '');
if (sanitized) {
    query = query.or(`id.ilike.%${sanitized}%,users.name.ilike.%${sanitized}%,users.email.ilike.%${sanitized}%`);
}
```

**Observación positiva:** Existe sanitización del input de búsqueda. Sin embargo, la cadena sanitizada se interpola directamente en el filtro `.or()` de PostgREST. Aunque PostgREST usa parameterización internamente, la construcción manual de strings de filtro con datos de usuario es una práctica que merece atención ya que el comportamiento exacto de PostgREST con caracteres especiales no siempre está completamente documentado.

---

## 3. DEBILIDADES ARQUITECTÓNICAS

### A. Ausencia de capa de seguridad perimetral (WAF / Rate Limiting)

La aplicación está desplegada en Vercel sin ninguna capa de protección perimetral:
- No hay WAF (Web Application Firewall)
- No hay rate limiting a nivel de infraestructura (Vercel Edge)
- No hay bot protection
- No hay protección DDoS más allá de la que ofrece Vercel por defecto

Un ataque de scraping, credential stuffing o card testing no encontraría ninguna resistencia a nivel de aplicación.

### B. Diseño de roles binario (admin / customer) sin granularidad

El sistema RBAC es binario: o eres `admin` (acceso total al panel) o eres `customer`. No existe:
- Roles intermedios (ej. `support`, `warehouse`, `marketing`)
- Permisos por recurso
- Acceso de solo lectura para ciertos roles de staff

Esto significa que cualquier persona con acceso al panel puede realizar cualquier operación administrativa: borrar productos, cancelar órdenes, ver todos los datos de clientes, modificar ajustes del sitio.

### C. Token de acceso JWT en cookie sin binding al dispositivo

El token JWT de Supabase se almacena en una cookie `httpOnly`, lo cual es correcto. Sin embargo, el token no está vinculado a ningún fingerprint de dispositivo, IP o User-Agent. Si un atacante roba la cookie (por ejemplo, mediante XSS, acceso físico al dispositivo, o MITM antes de HSTS), tiene acceso completo durante 7 días sin posibilidad de detección.

### D. Dependencia dual en email (webhook + confirm-order)

El sistema mantiene dos rutas para crear órdenes: el webhook de Stripe y `/api/stripe/confirm-order`. Aunque hay protección de idempotencia (`stripe_session_id` único), la duplicación de lógica de negocio crítica aumenta la superficie de bugs y la posibilidad de discrepancias entre los dos flujos (el webhook usa `checkout.session.completed` con stock via RPCs separadas; el confirm-intent usa la RPC `checkout_reserve_stock_and_order`). Un bug en uno no se detecta en el otro.

### E. Validación de precios: correcta en PaymentIntent, ausente en cupon_discount

Los precios de productos se validan correctamente en el backend antes de crear el PaymentIntent. Sin embargo, no se encontró validación backend del descuento de cupón: si el frontend calcula el descuento y lo envía al checkout, la cantidad final cobrada por Stripe se basa en el precio ya calculado en el frontend (enviado como `amountTotal`), no recalculado en base al precio del cupón almacenado en BD.

**Archivo afectado:** `src/pages/api/stripe/create-payment-intent.ts` y `create-session.ts` — verificar que el descuento de cupón se valida contra la BD y no se confía en el `amountTotal` enviado por el cliente.

---

## 4. PRÁCTICAS DE SEGURIDAD POSITIVAS

Las siguientes implementaciones representan buenas prácticas de seguridad que deben mantenerse:

✅ **Validación de precios en servidor:** `create-payment-intent.ts` y `create-session.ts` consultan la BD para obtener el precio real de cada producto, ignorando el precio enviado por el frontend.

✅ **Firma de webhook de Stripe:** `webhook.ts` usa `constructEvent` con `stripe-signature` para verificar la autenticidad de los eventos de Stripe.

✅ **Cookies httpOnly:** Los tokens de sesión se almacenan en cookies `httpOnly: true` con `secure: PROD`, evitando acceso desde JavaScript del cliente.

✅ **Doble verificación admin:** Tanto el middleware como `requireAdmin()` y `validateAdminAPI()` verifican independientemente que el usuario existe en `auth.users` (token válido) Y tiene `role = 'admin'` Y `is_active = true` en la tabla `users`.

✅ **Cliente admin separado:** `supabaseAdmin` usa la `SUPABASE_SERVICE_ROLE_KEY` — su ausencia provoca un error explícito que impide el arranque del servidor, evitando fallos silenciosos con el cliente anon.

✅ **Operaciones de stock atómicas:** La función SQL `checkout_reserve_stock_and_order` realiza la validación y decremento de stock en una transacción atómica, evitando race conditions.

✅ **Idempotencia en webhook:** La verificación de `stripe_session_id` existente en la BD evita el procesamiento doble de un mismo evento de Stripe.

✅ **Sanitización básica en editor de secciones:** `sections.ts` elimina `<script>`, `on*=` y `javascript:` del contenido guardado por el admin.

✅ **RLS en todas las tablas:** Todas las tablas de la BD tienen Row Level Security habilitado con políticas apropiadas (service_role para admin, authenticated para usuarios propios).

✅ **Policies RLS con `(SELECT auth.uid())`:** Las políticas usan el patrón optimizado que evita `auth_rls_initplan`.

✅ **Contraseña mínima de 8 caracteres:** Validada tanto en registro como en cambio de contraseña.

✅ **Verificación de contraseña actual:** El endpoint `update-password.ts` verifica la contraseña actual antes de permitir el cambio.

✅ **Invalidación de sesión server-side en logout:** El endpoint de logout llama a `admin.signOut(user.id)` para invalidar el token en Supabase, no solo borra la cookie local.

✅ **Verificación de `is_active` en cada request admin:** No solo se verifica en login, sino en cada llamada a `validateAdminAPI`.

✅ **Verificación de propiedad en recursos:** Los endpoints de dirección, factura y pedido verifican que el recurso pertenece al usuario autenticado antes de servir los datos.

✅ **Endpoint `/api/orders` obsoleto correctamente deprecado:** Devuelve `410 Gone` en lugar de simplemente eliminar el código, previniendo confusión.

---

## 5. FIXES CRÍTICOS OBLIGATORIOS ANTES DE PRODUCCIÓN

Los siguientes puntos son **bloqueantes** y deben resolverse antes de procesar pagos reales:

### P0 — Urgente (Crítico)

**[FIX-01] Eliminar o proteger el endpoint de debug**
```
// Opción A (recomendada): Eliminar el archivo
src/pages/api/debug-maintenance.ts → ELIMINAR

// Opción B: Proteger con validación admin
const result = await validateAdminAPI(request, cookies);
if (result instanceof Response) return result;
```

**[FIX-02] Reactivar la protección CSRF de Astro**
```javascript
// astro.config.mjs
security: {
    checkOrigin: true,  // ← Volver al valor por defecto
},
```

**[FIX-03] Eliminar el stack trace del endpoint de carrito**
```typescript
// src/pages/api/cart/merge.ts — reemplazar el catch
} catch (err: any) {
    console.error('[cart/merge] unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500 });
}
```

### P1 — Alta prioridad (antes del primer pago real)

**[FIX-04] Añadir cabeceras de seguridad HTTP**  
Configurar en `vercel.json` o en middleware de Astro:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- Content Security Policy básica

**[FIX-05] Implementar rate limiting en endpoints de autenticación y pago**  
Opciones: Vercel Edge Middleware, Upstash Redis con sliding window, o integración con Cloudflare.

**[FIX-06] Reducir maxAge de cookies admin a 4 horas**
```typescript
// src/pages/api/admin/login.ts
maxAge: 60 * 60 * 4, // 4 horas para admin (no 7 días)
```

**[FIX-07] Limpiar respuesta de error en register.ts**  
El campo `debug: authError` en la respuesta 500 debe eliminarse en producción.

**[FIX-08] Eliminar el endpoint GET de logout (o convertirlo a POST)**
```typescript
// No exponer logout vía GET (trivial CSRF)
// El src/pages/api/auth/logout.ts exporta GET — eliminar o proteger
```

**[FIX-09] Validar el descuento de cupón en el backend**  
Antes de crear el PaymentIntent/Session, recalcular el total en servidor usando el `couponCode` enviado y el descuento almacenado en BD, sin confiar en el `amountTotal` calculado por el frontend.

---

## 6. MEJORAS DE SEGURIDAD RECOMENDADAS

Las siguientes mejoras elevarían la plataforma a nivel enterprise:

### Autenticación y Sesiones
- **Multi-Factor Authentication (MFA):** Especialmente para cuentas de administrador.
- **Device fingerprinting:** Alertar o bloquear sesiones activas desde dispositivos nuevos.
- **Session listing:** Permitir al usuario ver y revocar sesiones activas desde otros dispositivos.
- **Suspicious login alerts:** Notificar por email cuando se detecta login desde nueva IP o país.

### API Security
- **Schema validation con Zod:** Validar todos los bodies de request con esquemas tipados.
- **API versioning:** Prefijo `/api/v1/` para facilitar futuras deprecaciones seguras.
- **Idempotency keys en PaymentIntent:** Enviar `idempotencyKey` en la creación de PI para evitar duplicados en reintentos.

### Headers y Transporte
- **CSP estricta:** `default-src 'self'; script-src 'self' https://js.stripe.com; frame-src https://js.stripe.com;`
- **Subresource Integrity (SRI):** Para scripts externos (aunque el setup actual los incluye vía npm).
- **Certificate Transparency monitoring:** Alertas si se emite un certificado TLS inesperado para el dominio.

### Cumplimiento Legal (RGPD)
- **Política de privacidad visible:** Requerida legalmente en la UE para tiendas online.
- **Consentimiento de cookies:** Banner de cookies requerido si se usan analytics o tracking.
- **Derecho al olvido:** Endpoint/proceso para que un usuario solicite la eliminación de su cuenta y datos.
- **Logs anonimizados:** Hashear emails y IPs en logs (usar HMAC SHA-256 con salt secreto).
- **Registro de actividad de datos:** Llevar registro de qué datos se procesan, de quién y para qué.

### Monitorización y Detección
- **SIEM / Alertas de seguridad:** Configurar alertas en Vercel o un servicio externo para:
  - Múltiples fallos de autenticación desde la misma IP
  - Accesos al panel admin desde IPs inusuales
  - Picos en creación de PaymentIntents
- **Audit log completo:** Ampliar `admin_logs` para incluir todas las operaciones sensibles con datos immutables (append-only).
- **Error tracking:** Integrar Sentry para detectar errores en producción sin exponer stack traces al cliente.

### Infraestructura
- **Cloudflare WAF:** Colocar la aplicación detrás de Cloudflare con reglas WAF activas.
- **Secrets rotation:** Proceso periódico de rotación de `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`.
- **Dependencias:** Eliminar `jsonwebtoken`, `bcryptjs`, `nodemailer`, `@react-email/*` si no se usan, o documentar explícitamente su uso. Usar `npm audit` en el pipeline de CI.

---

## APÉNDICE: ÁRBOL DE ARCHIVOS AUDITADOS

```
src/
├── middleware.ts                    ✅ Auditado
├── lib/
│   ├── admin.ts                     ✅ Auditado
│   ├── supabase.ts                  ✅ Auditado
│   ├── stripe.ts                    ✅ Auditado
│   ├── cart.ts                      ✅ Auditado
│   ├── pdf.ts                       ✅ Auditado
│   └── email/index.ts               ✅ Auditado
├── pages/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login.ts             ✅ Auditado
│   │   │   ├── register.ts          ✅ Auditado
│   │   │   ├── logout.ts            ✅ Auditado
│   │   │   ├── update-password.ts   ✅ Auditado
│   │   │   ├── update-profile.ts    ✅ Auditado
│   │   │   ├── save-address.ts      ✅ Auditado
│   │   │   ├── delete-address.ts    ✅ Auditado
│   │   │   └── set-default-address  ✅ Auditado
│   │   ├── admin/
│   │   │   ├── login.ts             ✅ Auditado
│   │   │   ├── products.ts          ✅ Auditado
│   │   │   ├── orders.ts            ✅ Auditado
│   │   │   ├── coupons.ts           ✅ Auditado
│   │   │   ├── reviews.ts           ✅ Auditado
│   │   │   ├── returns.ts           ✅ Auditado
│   │   │   ├── categories.ts        ✅ Auditado
│   │   │   ├── editor.ts            ✅ Auditado
│   │   │   ├── sections.ts          ✅ Auditado
│   │   │   └── settings.ts          ✅ Auditado
│   │   ├── stripe/
│   │   │   ├── create-payment-intent.ts ✅ Auditado
│   │   │   ├── create-session.ts        ✅ Auditado
│   │   │   ├── confirm-payment-intent.ts ✅ Auditado
│   │   │   ├── confirm-order.ts         ✅ Auditado
│   │   │   └── webhook.ts               ✅ Auditado
│   │   ├── cart/
│   │   │   ├── reserve.ts           ✅ Auditado
│   │   │   └── merge.ts             ✅ Auditado
│   │   ├── orders/invoice/[orderId].ts ✅ Auditado
│   │   ├── cart.ts                  ✅ Auditado
│   │   ├── orders.ts                ✅ Auditado
│   │   └── debug-maintenance.ts     ✅ Auditado (🔴 CRÍTICO)
│   ├── checkout.astro               ✅ Auditado
│   ├── profile.astro                ✅ Auditado
│   ├── login.astro                  ✅ Auditado
│   └── success.astro                ✅ Auditado
├── layouts/
│   ├── Layout.astro                 ✅ Auditado
│   └── AdminLayout.astro            ✅ Auditado
astro.config.mjs                     ✅ Auditado
package.json                         ✅ Auditado
```

---

## RESUMEN DE HALLAZGOS

| ID | Severidad | Descripción | Estado |
|---|---|---|---|
| CRIT-01 | 🔴 Crítica | Endpoint de debug público sin auth | REQUIERE FIX |
| CRIT-02 | 🔴 Crítica | CSRF protection deshabilitado | REQUIERE FIX |
| HIGH-01 | 🟠 Alta | Stack trace expuesto en /cart/merge | REQUIERE FIX |
| HIGH-02 | 🟠 Alta | Sin rate limiting en login | REQUIERE FIX |
| HIGH-03 | 🟠 Alta | Sin rate limiting en Stripe endpoints | REQUIERE FIX |
| HIGH-04 | 🟠 Alta | Sin cabeceras de seguridad HTTP | REQUIERE FIX |
| HIGH-05 | 🟠 Alta | Token admin con maxAge de 7 días | REQUIERE FIX |
| HIGH-06 | 🟠 Alta | Sin schema validation en APIs admin | MEJORA RECOMENDADA |
| MED-01 | 🟡 Media | Idempotencia incompleta en confirm-PI | MEJORA RECOMENDADA |
| MED-02 | 🟡 Media | TOCTOU en verificación de stock | ACEPTABLE en escala actual |
| MED-03 | 🟡 Media | Enumeración de usuarios posible | REQUIERE FIX |
| MED-04 | 🟡 Media | confirm-order callable sin auth | MEJORA RECOMENDADA |
| MED-05 | 🟡 Media | Logging de datos PII | REQUIERE FIX (RGPD) |
| MED-06 | 🟡 Media | ilike en ownership check de facturas | REVISIÓN |
| MED-07 | 🟡 Media | CSRF vía GET logout | REQUIERE FIX |
| LOW-01 | 🔵 Baja | Dependencias no utilizadas | LIMPIEZA |
| LOW-02 | 🔵 Baja | Sin validación URL en campo image | MEJORA RECOMENDADA |
| LOW-03 | 🔵 Baja | Cookie de sesión compartida admin/user | MEJORA RECOMENDADA |
| LOW-04 | 🔵 Baja | Sanitización de filtros PostgREST | REVISIÓN |

**Total:** 2 Críticas · 5 Altas · 5 Medias · 4 Bajas

---

*Este informe refleja el estado del código en la fecha de auditoría. Las vulnerabilidades detectadas deben ser evaluadas en el contexto operativo real. Este documento es confidencial y debe tratarse como material sensible.*
