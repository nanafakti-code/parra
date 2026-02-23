    -- ============================================================
    -- Migración: Soporte para pedidos de invitados y idempotencia de webhooks
    -- Ejecutar en Supabase SQL Editor ANTES de usar el nuevo webhook.
    -- ============================================================

    -- 1. Añadir stripe_session_id para idempotencia del webhook
    --    Permite verificar si un pago ya fue procesado.
    ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS stripe_session_id TEXT UNIQUE;

    -- 2. Hacer user_id nullable para soportar pedidos de invitados
    --    Los invitados no tienen cuenta, solo proporcionan email.
    ALTER TABLE orders
        ALTER COLUMN user_id DROP NOT NULL;

    -- 3. Añadir columna email para pedidos de invitados
    ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS email TEXT;

    -- 4. Índice para búsquedas por stripe_session_id (idempotencia)
    CREATE INDEX IF NOT EXISTS idx_orders_stripe_session
        ON orders(stripe_session_id);

    -- 5. Índice para búsquedas por email (pedidos de invitados)
    CREATE INDEX IF NOT EXISTS idx_orders_email
        ON orders(email);
