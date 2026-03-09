import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !service) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const admin = createClient(url, service);

async function findByEmail(email) {
  let page = 0;
  const perPage = 100;
  while (true) {
    const res = await admin.auth.admin.listUsers({ perPage, page });
    if (res.error) {
      console.error('Error listing users:', res.error);
      process.exit(2);
    }

    // Normalize possible response shapes
    let users = [];
    if (Array.isArray(res.data)) users = res.data;
    else if (res.data && Array.isArray(res.data.users)) users = res.data.users;
    else if (res.users && Array.isArray(res.users)) users = res.users;
    else {
      console.error('Respuesta inesperada de listUsers:', res);
      process.exit(2);
    }

    const found = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (users.length < perPage) break;
    page++;
  }
  return null;
}

const email = process.argv[2];
if (!email) {
  console.log('Uso: node tools/find-auth-user.js admin@example.com');
  process.exit(0);
}

(async () => {
  const u = await findByEmail(email);
  if (!u) {
    console.log('No existe usuario en Auth con ese email.');
    process.exit(0);
  }
  console.log('Auth user found:', {
    id: u.id,
    email: u.email,
    aud: u.aud,
    confirmed_at: u.confirmed_at,
    role: u.role,
    created_at: u.created_at,
  });
})();
