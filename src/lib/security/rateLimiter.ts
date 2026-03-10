import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 5 intentos por ventana de 10 segundos — login de usuario y admin
export const loginLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '10 s'),
    prefix: 'rl:login',
});

// 3 intentos por ventana de 10 segundos — registro de nuevos usuarios
export const registerLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '10 s'),
    prefix: 'rl:register',
});

// 10 intentos por ventana de 10 segundos — creación de pagos
export const paymentLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '10 s'),
    prefix: 'rl:payment',
});
