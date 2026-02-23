/**
 * src/lib/toast.ts
 * Sistema de notificaciones toast — sin dependencias externas.
 * Compatible con Astro (solo se ejecuta en el cliente).
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
    /** Duración en ms. Default: 3500 */
    duration?: number;
    type?: ToastType;
}

// ── Mantener referencia al contenedor entre llamadas ──
let _container: HTMLElement | null = null;

function getOrCreateContainer(): HTMLElement {
    if (_container && document.body.contains(_container)) return _container;

    _container = document.createElement('div');
    _container.id = 'toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-atomic', 'false');
    Object.assign(_container.style, {
        position:       'fixed',
        top:            '1.25rem',
        right:          '1.25rem',
        zIndex:         '99999',
        display:        'flex',
        flexDirection:  'column',
        gap:            '0.5rem',
        pointerEvents:  'none',
        maxWidth:       'min(380px, calc(100vw - 2.5rem))',
    });
    document.body.appendChild(_container);
    return _container;
}

const ICONS: Record<ToastType, string> = {
    success: `<svg viewBox="0 0 20 20" fill="currentColor" width="17" height="17" style="flex-shrink:0"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clip-rule="evenodd"/></svg>`,
    error:   `<svg viewBox="0 0 20 20" fill="currentColor" width="17" height="17" style="flex-shrink:0"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`,
    warning: `<svg viewBox="0 0 20 20" fill="currentColor" width="17" height="17" style="flex-shrink:0"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-5a1 1 0 00-1 1v2a1 1 0 002 0V9a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`,
    info:    `<svg viewBox="0 0 20 20" fill="currentColor" width="17" height="17" style="flex-shrink:0"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`,
};

const COLORS: Record<ToastType, { bg: string; border: string; text: string; accent: string }> = {
    success: { bg: '#0a1a0d', border: 'rgba(34,197,94,0.25)',  text: '#dcfce7', accent: '#22c55e' },
    error:   { bg: '#1a0a0a', border: 'rgba(239,68,68,0.25)',  text: '#fee2e2', accent: '#ef4444' },
    warning: { bg: '#1a150a', border: 'rgba(245,158,11,0.25)', text: '#fef3c7', accent: '#f59e0b' },
    info:    { bg: '#0a0f1a', border: 'rgba(59,130,246,0.25)', text: '#dbeafe', accent: '#3b82f6' },
};

function dismissToast(el: HTMLElement): void {
    el.style.transform = 'translateX(120%)';
    el.style.opacity   = '0';
    setTimeout(() => el.remove(), 340);
}

export function showToast(message: string, options: ToastOptions = {}): void {
    if (typeof window === 'undefined') return;

    const { duration = 3500, type = 'info' } = options;
    const c = COLORS[type];

    const el = document.createElement('div');
    el.setAttribute('role', 'alert');
    Object.assign(el.style, {
        display:        'flex',
        alignItems:     'center',
        gap:            '0.65rem',
        padding:        '0.8rem 1rem',
        background:     c.bg,
        border:         `1px solid ${c.border}`,
        borderLeft:     `3px solid ${c.accent}`,
        color:          c.text,
        fontSize:       '0.875rem',
        fontWeight:     '500',
        lineHeight:     '1.45',
        pointerEvents:  'auto',
        cursor:         'pointer',
        transform:      'translateX(120%)',
        transition:     'transform 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.3s ease',
        opacity:        '0',
        boxShadow:      '0 8px 24px rgba(0,0,0,0.45)',
        wordBreak:      'break-word',
    });

    el.innerHTML = `<span style="color:${c.accent}">${ICONS[type]}</span><span>${message}</span>`;
    getOrCreateContainer().appendChild(el);

    // Animate in (double rAF to ensure transition fires)
    requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            el.style.transform = 'translateX(0)';
            el.style.opacity   = '1';
        })
    );

    const timer = setTimeout(() => dismissToast(el), duration);
    el.addEventListener('click', () => { clearTimeout(timer); dismissToast(el); });
}

/** Convenience API: toast.success / .error / .warning / .info */
export const toast = {
    success: (msg: string, opts?: Omit<ToastOptions, 'type'>) =>
        showToast(msg, { ...opts, type: 'success' }),
    error: (msg: string, opts?: Omit<ToastOptions, 'type'>) =>
        showToast(msg, { ...opts, type: 'error' }),
    warning: (msg: string, opts?: Omit<ToastOptions, 'type'>) =>
        showToast(msg, { ...opts, type: 'warning' }),
    info: (msg: string, opts?: Omit<ToastOptions, 'type'>) =>
        showToast(msg, { ...opts, type: 'info' }),
};
