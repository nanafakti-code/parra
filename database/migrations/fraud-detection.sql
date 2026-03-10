-- ============================================================
-- fraud-detection.sql
-- Señales anti-fraude en el sistema de checkout:
--   1. Tabla fraud_logs — registro de intentos sospechosos
--   2. Columnas en orders — campos para revisión manual
--
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

-- ── 1. Columnas de fraude en la tabla orders ──────────────────────────────────
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS fraud_risk_level      TEXT,          -- 'normal' | 'elevated' | 'highest' | ''
    ADD COLUMN IF NOT EXISTS fraud_review_required BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS payment_outcome_type  TEXT;          -- 'authorized' | 'manual_review' | 'blocked' | …

-- Índice para filtrar órdenes en revisión desde el panel admin
CREATE INDEX IF NOT EXISTS idx_orders_fraud_review
    ON public.orders(fraud_review_required)
    WHERE fraud_review_required = true;

-- Índice para filtrar por nivel de riesgo
CREATE INDEX IF NOT EXISTS idx_orders_fraud_risk
    ON public.orders(fraud_risk_level)
    WHERE fraud_risk_level IS NOT NULL;

-- ── 2. Tabla fraud_logs — log inmutable de intentos sospechosos ───────────────
CREATE TABLE IF NOT EXISTS public.fraud_logs (
    id                UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID         REFERENCES public.users(id) ON DELETE SET NULL,
    ip_address        TEXT,
    payment_intent_id TEXT         NOT NULL,
    risk_level        TEXT,                         -- valor de Stripe outcome.risk_level
    outcome_type      TEXT,                         -- valor de Stripe outcome.type
    details           JSONB        NOT NULL DEFAULT '{}',   -- seller_message, timestamp, etc.
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- RLS: solo service_role puede leer/escribir (supabaseAdmin en el servidor)
ALTER TABLE public.fraud_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_logs_service_role" ON public.fraud_logs;
CREATE POLICY "fraud_logs_service_role"
    ON public.fraud_logs
    FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- Índices operacionales
CREATE INDEX IF NOT EXISTS idx_fraud_logs_payment_intent
    ON public.fraud_logs(payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_fraud_logs_created_at
    ON public.fraud_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_logs_risk_level
    ON public.fraud_logs(risk_level)
    WHERE risk_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fraud_logs_user
    ON public.fraud_logs(user_id)
    WHERE user_id IS NOT NULL;
