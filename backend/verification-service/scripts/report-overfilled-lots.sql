BEGIN TRANSACTION READ ONLY;

SELECT
  l.id AS lot_id,
  l.budget_id AS budget,
  l.batch_size AS ceiling,
  COUNT(u.id)::bigint AS issued_count
FROM lots l
LEFT JOIN unit_codes u ON u.lot_id = l.id
GROUP BY l.id, l.budget_id, l.batch_size
HAVING COUNT(u.id)::numeric > l.batch_size
ORDER BY COUNT(u.id) - l.batch_size DESC, l.id;

COMMIT;
