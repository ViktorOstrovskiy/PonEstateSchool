-- SQL скрипт для створення таблиці users
-- Виконай цей скрипт в SQL Editor на Render або в своїй PostgreSQL БД

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  current_lesson INTEGER DEFAULT 1,
  last_lesson_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Індекс для швидкого пошуку по telegram_id
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- Тригер для автоматичного оновлення updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Таблиця для одноразових кодів доступу
CREATE TABLE IF NOT EXISTS access_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_by_telegram_id BIGINT,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Індекс для швидкого пошуку по коду
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_used ON access_codes(is_used);

-- Додаємо поле has_access в таблицю users
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_access BOOLEAN DEFAULT FALSE;

-- Індекс для швидкого пошуку користувачів з доступом
CREATE INDEX IF NOT EXISTS idx_users_has_access ON users(has_access);

-- Перевірка створення таблиць
SELECT 'Таблиці users та access_codes успішно створені!' AS status;
