-- ============================================================
-- Tabla return_items: permite devoluciones parciales por artículo.
-- El cliente elige qué artículos (y cuántas unidades) devuelve.
-- El importe del reembolso se calcula a partir de estos artículos.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.return_items (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    return_id       UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
    order_item_id   UUID NOT NULL REFERENCES public.order_items(id),
    product_name    TEXT NOT NULL,
    product_image   TEXT,
    size            TEXT,
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_price      DECIMAL(10,2) NOT NULL,
    total_price     DECIMAL(10,2) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON public.return_items(return_id);

ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON public.return_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);
