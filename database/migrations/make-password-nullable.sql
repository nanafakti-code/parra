-- ============================================================
-- Migración: Hacer password nullable para Supabase Auth
-- Ejecutar en Supabase SQL Editor.
--
-- Con Supabase Auth, la contraseña se gestiona en auth.users,
-- no en public.users. Los nuevos usuarios no tendrán password
-- en la tabla propia.
-- ============================================================

-- 1. Hacer password nullable (los nuevos usuarios de Supabase Auth no la necesitan)
ALTER TABLE users
    ALTER COLUMN password DROP NOT NULL;

-- 2. Establecer valor por defecto para password (opcional, por compatibilidad)
ALTER TABLE users
    ALTER COLUMN password SET DEFAULT NULL;
