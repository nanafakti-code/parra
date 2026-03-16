import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse } from '../../../lib/admin';

/**
 * GET /api/admin/users
 * Search users by name or email (for exclusive coupon assignment).
 * Query params: ?q=search_term  (min 2 chars)
 */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();

    if (q.length < 2) {
        return jsonResponse({ users: [] }, 200);
    }

    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(20);

    if (error) return jsonResponse({ error: 'Error al buscar usuarios' }, 500);

    return jsonResponse({ users: data ?? [] });
};
