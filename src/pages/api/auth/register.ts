import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { hashPassword } from '../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { name, email, password } = await request.json();

        if (!email || !password) {
            return new Response(JSON.stringify({ message: 'Missing fields' }), { status: 400 });
        }

        // Check if user exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            return new Response(JSON.stringify({ message: 'User already exists' }), { status: 400 });
        }

        const hashedPassword = await hashPassword(password);

        const { error } = await supabase
            .from('users')
            .insert({
                name,
                email,
                password: hashedPassword,
            });

        if (error) {
            return new Response(JSON.stringify({ message: 'Failed to create user' }), { status: 500 });
        }

        return new Response(JSON.stringify({ message: 'User created' }), { status: 201 });
    } catch (error) {
        return new Response(JSON.stringify({ message: 'Internal Server Error' }), { status: 500 });
    }
};
