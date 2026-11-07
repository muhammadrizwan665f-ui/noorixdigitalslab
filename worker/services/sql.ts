export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Recomputes orders.status from its items. Bind: orderId (twice). */
export const RECOMPUTE_ORDER_SQL = `
UPDATE orders SET
  status = CASE
    WHEN NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = orders.id AND i.status NOT IN ('refunded','cancelled'))
      THEN CASE WHEN EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = orders.id AND i.status = 'refunded') THEN 'refunded' ELSE 'cancelled' END
    WHEN NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = orders.id AND i.status = 'processing')
         AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = orders.id AND i.status = 'completed') THEN 'completed'
    WHEN NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = orders.id AND i.status IN ('processing','completed'))
         AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = orders.id AND i.status = 'failed') THEN 'failed'
    ELSE 'processing' END,
  completed_at = CASE WHEN completed_at IS NULL AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = orders.id AND i.status = 'processing') AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = orders.id AND i.status='completed') THEN ${NOW} ELSE completed_at END,
  updated_at = ${NOW}
WHERE id = ?`;
