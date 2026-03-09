import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !service) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const admin = createClient(url, service);

async function findUserByEmail(email) {
  const { data, error } = await admin.from('users').select('id, email').eq('email', email).maybeSingle();
  if (error) throw error;
  return data;
}

async function updatePassword(userId, newPassword) {
  try {
    const { data, error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
      console.error('Error al actualizar contraseña:', error);
      process.exit(2);
    }
    console.log('Contraseña actualizada correctamente para user id:', userId);
    console.log('Resultado:', data);
  } catch (e) {
    console.error('Error inesperado:', e);
    process.exit(3);
  }
}

(async function main(){
  const arg = process.argv[2];
  const newPass = process.argv[3];

  if (!arg || !newPass) {
    console.log('Uso: node tools/update-admin-password.js <user-id|email> <new-password>');
    process.exit(0);
  }

  let userId = arg;
  if (arg.includes('@')) {
    const u = await findUserByEmail(arg);
    if (!u) {
      console.error('No se encontró usuario con ese email.');
      process.exit(4);
    }
    userId = u.id;
  }

  console.log('Actualizando contraseña para:', userId);
  await updatePassword(userId, newPass);
  process.exit(0);
})();
