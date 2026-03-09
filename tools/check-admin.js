import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || anon;

console.log('SUPABASE_URL:', !!url);
console.log('SUPABASE_ANON_KEY:', !!anon);
console.log('SUPABASE_SERVICE_ROLE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!url || !anon) {
  console.error('Faltan variables SUPABASE_URL o SUPABASE_ANON_KEY en tu entorno. Crea un .env con ellas.');
  process.exit(1);
}

const adminClient = createClient(url, service);
const anonClient = createClient(url, anon);

async function check(email, password) {
  try {
    const { data, error } = await adminClient.from('users').select('id, email, role, is_active, created_at').eq('email', email).maybeSingle();
    if (error) {
      console.error('Error al consultar users:', error);
      process.exit(2);
    }
    if (!data) {
      console.log('No existe usuario con ese email en la tabla `users`.');
    } else {
      console.log('Usuario (tabla users):', data);
    }

    // Si nos pasaron contraseña, intentamos iniciar sesión con el cliente anónimo
    if (password) {
      console.log('\nIntentando signInWithPassword usando el cliente anónimo...');
      const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError) {
        console.log('signIn error:', authError.message || authError);
      } else {
        console.log('signIn OK. session:', !!authData.session);
        if (authData.session) {
          console.log('User id (auth):', authData.user?.id);
        }
      }
    } else {
      console.log('\nNota: para comprobar la autenticación también puedes pasar la contraseña como segundo argumento:');
      console.log('  node tools/check-admin.js admin@ejemplo.es "TuContraseña"');
    }
  } catch (e) {
    console.error('Error inesperado:', e);
  }
}

const emailArg = process.argv[2];
const passArg = process.argv[3];
if (!emailArg) {
  console.log('Uso: node tools/check-admin.js admin@example.com [password]');
  process.exit(0);
}

check(emailArg, passArg).then(() => process.exit(0));
