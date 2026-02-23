/**
 * src/lib/cart.ts
 * Gestor de carrito production-ready.
 *
 * ✅ localStorage para invitados
 * ✅ Reserva de stock en BD (atómica, con rpc)
 * ✅ Toast en lugar de alert()
 * ✅ mergeGuestCart() en login
 * ✅ Evento 'cart:updated' reactivo
 */

import { toast } from './toast';

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface CartItem {
    id: string;         // product id
    variantId?: string; // product_variant id (opcional — para talla)
    name: string;
    price: number;
    image: string;
    size?: string;
    quantity: number;
    stock: number;      // snapshot del stock al añadir (cota optimista)
    slug: string;
}

export interface ReserveResult {
    success: boolean;
    available?: number;
    error?: string;
}

// ── Claves localStorage ────────────────────────────────────────────────────────
const CART_KEY = 'parra_cart';
const SESSION_KEY = 'parra_cart_session';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Identificador único por línea: variantId si existe, si no productId */
function itemKey(id: string, variantId?: string): string {
    return variantId && variantId !== '' ? variantId : id;
}

/** UUID de sesión persistido en localStorage (invitados y usuarios) */
export function getSessionId(): string {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(SESSION_KEY, id);
    }
    return id;
}

export function getCart(): CartItem[] {
    if (typeof window === 'undefined') return [];
    try {
        return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveCart(items: CartItem[]): void {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('cart:updated', { detail: items }));
}

// ── Reservas en backend ────────────────────────────────────────────────────────

async function syncReservation(
    productId: string,
    variantId: string | undefined,
    quantity: number,
    action: 'add' | 'remove'
): Promise<ReserveResult> {
    try {
        const res = await fetch('/api/cart/reserve', {
            method: action === 'add' ? 'POST' : 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productId,
                variantId: variantId || null,
                quantity,
                sessionId: getSessionId(),
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                success: false,
                available: data.available,
                error: data.error || data.message || 'Error de stock'
            };
        }
        return { success: true };
    } catch (err) {
        console.error('[cart] syncReservation failed:', err);
        return { success: false, error: 'Error de conexión' };
    }
}

// ── Operaciones públicas ───────────────────────────────────────────────────────

/**
 * Añade un ítem al carrito.
 * 1. Valida stock local (optimista, rápido)
 * 2. Reserva atómica en BD
 * 3. Actualiza localStorage y dispara evento
 * @returns true si se añadió con éxito
 */
export async function addItem(
    item: Omit<CartItem, 'quantity'> & { quantity?: number }
): Promise<boolean> {
    const qtyToAdd = Math.max(1, item.quantity ?? 1);
    const key = itemKey(item.id, item.variantId);
    const cart = getCart();
    const existing = cart.find(c => itemKey(c.id, c.variantId) === key);
    const currentQty = existing?.quantity ?? 0;

    // Comprobación optimista rápida con el snapshot de stock
    if (item.stock > 0 && currentQty + qtyToAdd > item.stock) {
        const left = item.stock - currentQty;
        if (left <= 0) {
            toast.error('Sin stock disponible.');
        } else {
            toast.warning(`Solo ${left} unidad${left !== 1 ? 'es' : ''} disponible${left !== 1 ? 's' : ''}.`);
        }
        return false;
    }

    // Reserva atómica (la fuente de verdad real)
    const result = await syncReservation(item.id, item.variantId, qtyToAdd, 'add');
    if (!result.success) {
        const avail = result.available ?? 0;
        if (result.error && result.error !== 'Stock insuficiente') {
            toast.error(`Error: ${result.error}`);
        } else if (avail <= 0) {
            toast.error('Sin stock disponible. Alguien más lo acaba de reservar.');
        } else {
            toast.warning(`Solo ${avail} unidad${avail !== 1 ? 'es' : ''} disponible${avail !== 1 ? 's' : ''}.`);
        }
        return false;
    }

    // Actualizar carrito local
    if (existing) {
        saveCart(cart.map(c =>
            itemKey(c.id, c.variantId) === key
                ? { ...c, quantity: c.quantity + qtyToAdd }
                : c
        ));
    } else {
        saveCart([...cart, { ...item, quantity: qtyToAdd } as CartItem]);
    }

    toast.success(`${item.name} añadido al carrito.`);
    return true;
}

/**
 * Elimina un ítem del carrito (actualización optimista + liberación de reserva en BG).
 */
export async function removeItem(id: string, variantId?: string): Promise<void> {
    const key = itemKey(id, variantId);
    const cart = getCart();
    const item = cart.find(c => itemKey(c.id, c.variantId) === key);
    if (!item) return;

    // Actualización UI inmediata (optimista)
    saveCart(cart.filter(c => itemKey(c.id, c.variantId) !== key));

    // Liberar reserva en background
    syncReservation(item.id, item.variantId, item.quantity, 'remove')
        .catch(err => console.error('[cart] removeItem release failed:', err));
}

/**
 * Actualiza la cantidad de un ítem.
 * @returns true si se actualizó con éxito
 */
export async function updateQty(
    id: string,
    variantId: string | undefined,
    quantity: number
): Promise<boolean> {
    if (quantity < 1) {
        await removeItem(id, variantId);
        return true;
    }

    const key = itemKey(id, variantId);
    const cart = getCart();
    const item = cart.find(c => itemKey(c.id, c.variantId) === key);
    if (!item) return false;

    const diff = quantity - item.quantity;
    if (diff === 0) return true;

    if (diff > 0) {
        // Necesitamos reservar más stock
        const result = await syncReservation(item.id, item.variantId, diff, 'add');
        if (!result.success) {
            const avail = result.available ?? 0;
            if (result.error && result.error !== 'Stock insuficiente') {
                toast.error(`Error: ${result.error}`);
            } else {
                toast.warning(
                    avail <= 0
                        ? 'No hay más stock disponible.'
                        : `Máximo ${item.quantity + avail} unidades disponibles.`
                );
            }
            return false;
        }
    } else {
        // Liberar el exceso en background
        syncReservation(item.id, item.variantId, Math.abs(diff), 'remove')
            .catch(err => console.error('[cart] updateQty release failed:', err));
    }

    saveCart(cart.map(c =>
        itemKey(c.id, c.variantId) === key
            ? { ...c, quantity }
            : c
    ));
    return true;
}

/**
 * Vacía el carrito y libera todas las reservas.
 */
export function clearCart(): void {
    const cart = getCart();
    const sessionId = getSessionId();

    // Liberar todas las reservas en parallel (fire-and-forget)
    cart.forEach(item => {
        fetch('/api/cart/reserve', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productId: item.id,
                variantId: item.variantId || null,
                quantity: item.quantity,
                sessionId,
            }),
        }).catch(() => { });
    });

    localStorage.removeItem(CART_KEY);
    window.dispatchEvent(new CustomEvent('cart:updated', { detail: [] }));
}

// ── Helpers de lectura ─────────────────────────────────────────────────────────

export function cartCount(): number {
    return getCart().reduce((sum, c) => sum + c.quantity, 0);
}

export function cartTotal(): number {
    return getCart().reduce((sum, c) => sum + c.price * c.quantity, 0);
}

// ── Login merge: invitado → usuario autenticado ───────────────────────────────

/**
 * Fusiona el carrito de invitado con el carrito del usuario autenticado.
 * Llama a este función justo después de hacer login exitoso.
 *
 * @param userSessionId  El ID de sesión del usuario autenticado
 */
export async function mergeGuestCart(userSessionId: string): Promise<void> {
    const guestSessionId = getSessionId();
    if (!guestSessionId || guestSessionId === userSessionId) return;
    if (getCart().length === 0) return;

    try {
        const res = await fetch('/api/cart/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guestSessionId, userSessionId }),
        });
        if (!res.ok) throw new Error('merge failed');

        // A partir de ahora usamos el session id del usuario
        localStorage.setItem(SESSION_KEY, userSessionId);
        toast.success('Tu carrito ha sido guardado en tu cuenta.');
    } catch (err) {
        console.error('[cart] mergeGuestCart failed:', err);
    }
}
