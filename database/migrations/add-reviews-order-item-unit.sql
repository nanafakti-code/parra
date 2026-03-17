-- Vincular reseñas a order_item para permitir reseñas por pedido y por unidad
-- Esto permite que un usuario reseñe el mismo producto en pedidos distintos
-- y que cada unidad comprada tenga su propia reseña independiente.
ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit_index INT NOT NULL DEFAULT 0;

-- Índice único: un usuario solo puede enviar una reseña por (order_item, unidad)
CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_item_unit_unique
    ON reviews(user_id, order_item_id, unit_index)
    WHERE order_item_id IS NOT NULL;
