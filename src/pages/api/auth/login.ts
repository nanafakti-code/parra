import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { comparePassword, createToken } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return new Response(JSON.stringify({ message: 'Missing fields' }), { status: 400 });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (!user || error || !(await comparePassword(password, user.password))) {
            return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 });
        }

        const token = createToken({ userId: user.id, email: user.email });

        cookies.set('auth_token', token, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        return new Response(JSON.stringify({ message: 'Login successful', user: { name: user.name, email: user.email } }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ message: 'Internal Server Error' }), { status: 500 });
    }
};
