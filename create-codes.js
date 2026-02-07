require('dotenv').config()
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL не встановлено в .env файлі!')
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
})

async function createAccessCodes() {
  try {
    console.log('🔗 Підключення до бази даних...')
    
    // Перевірка з'єднання
    await pool.query('SELECT NOW()')
    console.log('✅ Підключено до БД\n')

    // Створюємо таблицю access_codes, якщо не існує
    console.log('🔧 Перевірка таблиці access_codes...')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS access_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_by_telegram_id BIGINT,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)
    
    // Створюємо індекси
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_access_codes_used ON access_codes(is_used)
    `)
    
    console.log('✅ Таблиця access_codes готова\n')

    // Кількість кодів для створення (можна змінити)
    const numberOfCodes = 30
    
    console.log(`📝 Створення ${numberOfCodes} унікальних кодів доступу...\n`)

    // Функція для генерації випадкового коду
    function generateRandomCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Виключив 0, O, I, 1 для уникнення плутанини
      const length = 8
      let code = ''
      for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      return `PON-${code}`
    }

    // Генеруємо унікальні коди
    const codes = []
    const existingCodes = new Set()
    
    // Отримуємо існуючі коди з БД
    const existing = await pool.query('SELECT code FROM access_codes')
    existing.rows.forEach(row => existingCodes.add(row.code))
    
    while (codes.length < numberOfCodes) {
      const code = generateRandomCode()
      if (!existingCodes.has(code) && !codes.includes(code)) {
        codes.push(code)
        existingCodes.add(code)
      }
    }

    // Вставляємо коди в БД
    for (const code of codes) {
      try {
        await pool.query(
          'INSERT INTO access_codes (code, is_used, created_at) VALUES ($1, FALSE, NOW()) ON CONFLICT (code) DO NOTHING',
          [code]
        )
        console.log(`   ✅ ${code}`)
      } catch (err) {
        if (err.code === '23505') { // Unique violation
          console.log(`   ⚠️  ${code} (вже існує)`)
        } else {
          console.error(`   ❌ ${code} - помилка:`, err.message)
        }
      }
    }

    // Показуємо статистику
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_used = FALSE) as unused,
        COUNT(*) FILTER (WHERE is_used = TRUE) as used
      FROM access_codes
    `)

    const statsRow = stats.rows[0]
    console.log('\n📊 Статистика кодів:')
    console.log(`   Всього: ${statsRow.total}`)
    console.log(`   Не використано: ${statsRow.unused}`)
    console.log(`   Використано: ${statsRow.used}`)

    // Показуємо невикористані коди
    const unusedCodes = await pool.query(
      'SELECT code FROM access_codes WHERE is_used = FALSE ORDER BY code LIMIT 10'
    )

    if (unusedCodes.rows.length > 0) {
      console.log('\n📋 Перші 10 невикористаних кодів:')
      unusedCodes.rows.forEach(row => {
        console.log(`   ${row.code}`)
      })
    }

    console.log('\n✅ Готово! Унікальні коди створені.')
    
    // Зберігаємо коди в файл для зручності
    const codesFilePath = path.join(__dirname, 'access_codes.txt')
    const codesText = codes.join('\n')
    fs.writeFileSync(codesFilePath, codesText, 'utf8')
    console.log(`\n💾 Коди збережено в файл: access_codes.txt`)
    
    // Також створюємо файл з форматуванням для менеджера
    const managerFilePath = path.join(__dirname, 'access_codes_for_manager.txt')
    const managerText = `Коди доступу для учнів PON School:\n\n${codes.map((code, index) => `${index + 1}. ${code}`).join('\n')}\n\nІнструкція для учнів:\n1. Відкрий бота в Telegram\n2. Надішли команду: /activate КОД\n3. Після активації напиши: /start`
    fs.writeFileSync(managerFilePath, managerText, 'utf8')
    console.log(`📄 Файл для менеджера: access_codes_for_manager.txt`)
    
    console.log('\n💡 Роздай ці коди учням, вони зможуть активувати їх командою:')
    console.log('   /activate PON-XXXXXXXX')
    console.log('\n📝 Всі створені коди:')
    codes.forEach((code, index) => console.log(`   ${index + 1}. ${code}`))
    
    console.log('\n📋 Для копіювання всіх кодів відкрий файл: access_codes.txt')

  } catch (error) {
    console.error('❌ Помилка:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Запускаємо
createAccessCodes()
