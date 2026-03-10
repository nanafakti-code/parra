import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ── Graceful no-op limiter for local dev (no Upstash credentials) ─────────────
interface LimiterLike {
    limit: (_key: string) => Promise<{ success: boolean }>;
}

const noopLimiter: LimiterLike = {
    limit: async (_key: string) => ({ success: true }),
};

function buildLimiter(window: number, seconds: string, prefix: string): LimiterLike {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(
                `[rateLimiter] UPSTASH credentials missing — ` +
                `rate limiting disabled for "${prefix}" (dev mode).`,
            );
        } else {
            console.error(
                `[rateLimiter] UPSTASH credentials missing in production for "${prefix}". ` +
                `Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.`,
            );
        }
        return noopLimiter;
    }

    const redis = new Redis({ url, token });
    return new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(window, seconds as Parameters<typeof Ratelimit.slidingWindow>[1]),
        prefix,
    });
}

// 5 intentos por ventana de 10 segundos — login de usuario y admin
export const loginLimiter    = buildLimiter(5,  '10 s', 'rl:login');

// 3 intentos por ventana de 10 segundos — registro de nuevos usuarios
export const registerLimiter = buildLimiter(3,  '10 s', 'rl:register');

// 10 intentos por ventana de 10 segundos — creación de pagos
export const paymentLimiter  = buildLimiter(10, '10 s', 'rl:payment');
