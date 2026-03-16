-- Fix: el índice parcial en (event_key, to_email) no puede usarse como árbitro
-- de ON CONFLICT en PostgreSQL. El upsert de la cola fallaba silenciosamente con
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Además, si la migración original se ejecutó desde una versión anterior, las columnas
-- event_key y provider_message_id pueden no existir todavía.

-- 1. Añadir columnas que pueden faltar de versiones anteriores de la migración
ALTER TABLE public.newsletter_email_queue
    ADD COLUMN IF NOT EXISTS event_key          TEXT,
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

-- 2. Eliminar filas duplicadas en (event_key, to_email) — guardar la más antigua
DELETE FROM public.newsletter_email_queue
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY event_key, to_email
                   ORDER BY created_at ASC
               ) AS rn
        FROM public.newsletter_email_queue
        WHERE event_key IS NOT NULL
    ) ranked
    WHERE rn > 1
);

-- 3. Eliminar el índice parcial que impedía el uso como árbitro de ON CONFLICT
DROP INDEX IF EXISTS public.idx_newsletter_email_queue_event_email_unique;

-- 4. Añadir un CONSTRAINT UNIQUE completo que ON CONFLICT puede usar como árbitro
--    (NULLs son DISTINCT por defecto: las filas sin event_key no colisionan entre sí)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE  conname  = 'newsletter_email_queue_event_email_uq'
          AND  conrelid = 'public.newsletter_email_queue'::regclass
    ) THEN
        ALTER TABLE public.newsletter_email_queue
            ADD CONSTRAINT newsletter_email_queue_event_email_uq
            UNIQUE (event_key, to_email);
    END IF;
END $$;
