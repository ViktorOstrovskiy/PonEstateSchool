-- SQL скрипт для створення кодів доступу
-- Виконай цей скрипт в SQL Editor на Render або в своїй PostgreSQL БД

-- Приклад: створення 10 кодів доступу
-- Можеш змінити кількість та формат кодів

INSERT INTO access_codes (code, is_used, created_at)
VALUES 
  ('PON2024-001', FALSE, NOW()),
  ('PON2024-002', FALSE, NOW()),
  ('PON2024-003', FALSE, NOW()),
  ('PON2024-004', FALSE, NOW()),
  ('PON2024-005', FALSE, NOW()),
  ('PON2024-006', FALSE, NOW()),
  ('PON2024-007', FALSE, NOW()),
  ('PON2024-008', FALSE, NOW()),
  ('PON2024-009', FALSE, NOW()),
  ('PON2024-010', FALSE, NOW())
ON CONFLICT (code) DO NOTHING;

-- Перевірка створених кодів
SELECT 
  code,
  is_used,
  used_by_telegram_id,
  used_at,
  created_at
FROM access_codes
ORDER BY created_at DESC;

-- Для створення одного коду використовуй:
-- INSERT INTO access_codes (code) VALUES ('ТВІЙ_КОД');
