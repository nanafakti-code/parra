import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies }) => {
    cookies.delete('auth_token', { path: '/' });
    return new Response(JSON.stringify({ message: 'Logged out' }), { status: 200 });
};
