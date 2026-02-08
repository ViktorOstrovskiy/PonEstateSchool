require('dotenv').config()
const { Telegraf, Markup } = require('telegraf')
const { Pool } = require('pg')
const express = require('express')

// Перевірка змінних оточення
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не встановлено!')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL не встановлено!')
  process.exit(1)
}

const bot = new Telegraf(process.env.BOT_TOKEN)

// Підключення до PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
})

// Автоматичне створення таблиці users (якщо не існує)
async function initDatabase() {
  try {
    // Створюємо таблицю users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        current_lesson INTEGER DEFAULT 1,
        last_lesson_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)

    // Створюємо індекс
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)
    `)

    // Створюємо функцію для updated_at
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `)

    // Створюємо тригер
    await pool.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `)

    // Додаємо поле has_access в таблицю users (якщо не існує)
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_access BOOLEAN DEFAULT FALSE
    `)

    // Створюємо індекс для has_access
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_has_access ON users(has_access)
    `)

    // Створюємо таблицю access_codes для одноразових кодів
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

    // Створюємо індекси для access_codes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code)
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_access_codes_used ON access_codes(is_used)
    `)

    console.log('✅ Таблиці users та access_codes створені/перевірені')
  } catch (err) {
    console.error('❌ Помилка створення таблиці:', err.message)
    throw err
  }
}

// Створюємо Express сервер для webhook
const app = express()

// Middleware для парсингу JSON
app.use(express.json())

// Endpoint для webhook від Telegram
app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body)
  res.sendStatus(200)
})

// Health check endpoint (для Render)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'PON School Bot is running',
    status: 'ok'
  })
})

// Ініціалізація БД та запуск сервера
async function startServer() {
  try {
    // Тест з'єднання з БД
    await pool.query('SELECT NOW()')
    console.log('✅ Підключено до БД')
    
    // Ініціалізація таблиці
    await initDatabase()
    
    // Запускаємо Express сервер
    const PORT = process.env.PORT || 3000
    app.listen(PORT, () => {
      console.log(`✅ Сервер запущено на порту ${PORT}`)
      console.log(`✅ Webhook endpoint: /webhook/${process.env.BOT_TOKEN}`)
      console.log(`✅ Health check: /health`)
    })
    
    // Налаштовуємо webhook (якщо вказано WEBHOOK_URL)
    if (process.env.WEBHOOK_URL) {
      const webhookUrl = `${process.env.WEBHOOK_URL}/webhook/${process.env.BOT_TOKEN}`
      await bot.telegram.setWebhook(webhookUrl)
      console.log(`✅ Webhook встановлено: ${webhookUrl}`)
    } else {
      console.log('⚠️  WEBHOOK_URL не встановлено. Встанови webhook вручну через Bot API.')
    }
    
  } catch (err) {
    console.error('❌ Помилка запуску:', err.message)
    process.exit(1)
  }
}

// Запускаємо сервер
startServer()

// База уроків (10 уроків)
// Формат: заголовок, текст, посилання на матеріал, посилання на домашнє завдання
const lessons = [
  {
    title: 'ДЕНЬ 1 - Введение в профессию',
    text: `Добро пожаловать в школу PON Estate! 🎓

Сегодня ты узнаешь:
• Кто такой агент недвижимости
• Как зарабатывают агенты в Батуми
• Структура работы в PON Estate
• Цели обучения и правила курса
• Знакомство с руководителем компании Андреем Пономаренко`,
    materials: [
      {
        title: 'Кто такой агент недвижимости',
        url: 'https://docs.google.com/document/d/1kPVAowcRpHKklw8pqBtvjvxtnO5xn8C5Jvd8s6ZFNj4/edit?tab=t.0'
      },
      {
        title: 'Как зарабатывают агенты в Батуми',
        url: 'https://docs.google.com/document/d/1kPVAowcRpHKklw8pqBtvjvxtnO5xn8C5Jvd8s6ZFNj4/edit?tab=t.f3gau11buy43'
      },
      {
        title: 'Цели обучения и правила курса',
        url: 'https://docs.google.com/document/d/1kPVAowcRpHKklw8pqBtvjvxtnO5xn8C5Jvd8s6ZFNj4/edit?tab=t.9tfoxz9ptwgi'
      }
    ],
    homeworkUrl: 'https://forms.gle/51zvGQH7waJT52XdA',
    homeworkText: `Домашнее задание:
• Написать, почему вы решили работать в недвижимости
• Сформулировать личную цель на время обучения и на ближайшие 6 месяцев
• Изучить Intourist Palace Hotel (Мы направим материалы по объекту, после чего будет тест по нему + дз)`,
    additionalText: `Оставляю тебе всю информацию по проекту BATMSHENI INTOURIST 📚 и ссылку на него https://docs.google.com/document/d/1kPVAowcRpHKklw8pqBtvjvxtnO5xn8C5Jvd8s6ZFNj4/edit?tab=t.rowiuij0gzqr`
  },
  {
    title: 'ДЕНЬ 2 - Рынок недвижимости Батуми',
    text: `Сегодня ты узнаешь:
• Типы объектов недвижимости
• Застройщики и проекты
• Первичный и вторичный рынок
• Инвестиции и жизнь

Понимание рынка — основа успеха!`,
    materials: [
      {
        title: 'Типы объектов',
        url: 'https://docs.google.com/document/d/1M5_BdAznd0VlvFZ8xiERY-Ks8nIj0DsKL3n3oRZyZec/edit?tab=t.d7qzm4ob1fg7'
      },
      {
        title: 'Застройщики и проекты',
        url: 'https://docs.google.com/document/d/1M5_BdAznd0VlvFZ8xiERY-Ks8nIj0DsKL3n3oRZyZec/edit?tab=t.d7qzm4ob1fg7'
      },
      {
        title: 'Первичка / вторичка',
        url: 'https://docs.google.com/document/d/1M5_BdAznd0VlvFZ8xiERY-Ks8nIj0DsKL3n3oRZyZec/edit?tab=t.d7qzm4ob1fg7'
      },
      {
        title: 'Инвестиции и жизнь',
        url: 'https://docs.google.com/document/d/1M5_BdAznd0VlvFZ8xiERY-Ks8nIj0DsKL3n3oRZyZec/edit?tab=t.d7qzm4ob1fg7'
      }
    ],
    homeworkUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSda-eFMYysVAJpa33H7p-6RA2RDW9Sm2fJoHACxPiu5WECE9Q/viewform?usp=header',
    homeworkText: `Домашнее задание:
• Выписать основные типы объектов недвижимости в Батуми
• Назвать минимум 5 застройщиков и 5 проектов
• Кратко описать разницу между первичным и вторичным рынком
• Почему вы хотите работать именно в недвижимости и что для вас важнее: быстрый доход или долгосрочные отношения с клиентом? Почему?
• Изучить проект Metropol OVAL + ТЕСТ`,
    additionalText: `Оставляю тебе всю информацию по проекту METROPOL OVAL 📚 - https://docs.google.com/document/d/1M5_BdAznd0VlvFZ8xiERY-Ks8nIj0DsKL3n3oRZyZec/edit?tab=t.osdxzbkkccv7`
  },
  {
    title: 'ДЕНЬ 3 - Клиенты и лиды',
    text: `Сегодня ты узнаешь:
• Кто такой лид
• Откуда приходят клиенты
• Холодные, тёплые и горячие лиды
• Правила работы с лидами

Инструкция по обработке лидов есть в базе знаний.`,
    materials: [
      {
        title: 'Кто такой лид',
        url: 'https://docs.google.com/document/d/1EPxx6phfSSAnnZ9GeXN6mrvAhDcXTvTuVZfs0-ZQyS0/edit?tab=t.0'
      },
      {
        title: 'Откуда приходят клиенты',
        url: 'https://docs.google.com/document/d/1EPxx6phfSSAnnZ9GeXN6mrvAhDcXTvTuVZfs0-ZQyS0/edit?tab=t.ogbr38nve0k9'
      },
      {
        title: 'Холодные, тёплые и горячие лиды',
        url: 'https://docs.google.com/document/d/1EPxx6phfSSAnnZ9GeXN6mrvAhDcXTvTuVZfs0-ZQyS0/edit?tab=t.11yg0hd7rzpg'
      },
      {
        title: 'Правила работы с лидами',
        url: 'https://docs.google.com/document/d/1EPxx6phfSSAnnZ9GeXN6mrvAhDcXTvTuVZfs0-ZQyS0/edit?tab=t.iqjhkagqmnt4'
      }
    ],
    homeworkUrl: 'https://forms.gle/a9vTP9aD4dfBvyVF7',
    homeworkText: `Домашнее задание:
• Описать разницу между холодными, тёплыми и горячими лидами
• Выписать основные ошибки новичков при работе с лидами
• Кратко описать алгоритм работы с лидом
• Как вы реагируете, когда клиент говорит "нет" несколько раз подряд? Что вы делаете дальше?
• Изучить проект Next Group Address + ТЕСТ`,
    additionalText: `Оставляю тебе всю информацию по проекту NEXT GROUP ADDRESS 📚 - `
  },
  {
    title: 'ДЕНЬ 4 - Сообщения клиенту и коммуникация',
    text: `Сегодня ты узнаешь:
• Как писать первое сообщение клиенту
• WhatsApp / Telegram / Instagram: особенности общения
• Этику общения с клиентом
• Зачем и как выводить клиента на Zoom и личные встречи
• Шаблоны сообщений
• Чего нельзя писать и говорить клиенту

Этика общения с клиентом и шаблоны сообщений есть в базе знаний.`,
    materials: [
      {
        title: 'Как писать первое сообщение клиенту',
        url: 'https://docs.google.com/document/d/1BDCNDZcYRk92RXfvjSGGugTN_UeplcvgG7skhPAqWpM/edit?tab=t.0'
      },
      {
        title: 'Этика общения с клиентом',
        url: 'https://docs.google.com/document/d/1BDCNDZcYRk92RXfvjSGGugTN_UeplcvgG7skhPAqWpM/edit?tab=t.l5o4h5enfd91'
      },
      {
        title: 'Шаблоны сообщений',
        url: 'https://docs.google.com/document/d/1BDCNDZcYRk92RXfvjSGGugTN_UeplcvgG7skhPAqWpM/edit?tab=t.n53x4nrvf3lp'
      },
      {
        title: 'Чего нельзя писать и говорить клиенту',
        url: 'https://docs.google.com/document/d/1BDCNDZcYRk92RXfvjSGGugTN_UeplcvgG7skhPAqWpM/edit?tab=t.gkok157u1tz8'
      }
    ],
    homeworkUrl: 'https://forms.gle/63k8QNfiKwNy1ahK6',
    homeworkText: `Домашнее задание:
• Написать 3 варианта первого сообщения клиенту
• Написать сообщение для вывода клиента на Zoom
• Что такое этика общения с клиентом
• Представьте, что клиент недоволен и раздражён. Как вы будете с ним общаться?
• Изучить проект One Development Stay&Rent + ТЕСТ`,
    additionalText: `Оставляю тебе всю информацию по проекту ONE DEVELOPMENT Stay&Rent 📚 - https://docs.google.com/document/d/1BDCNDZcYRk92RXfvjSGGugTN_UeplcvgG7skhPAqWpM/edit?tab=t.dyzh0s1ch7u`
  },
  {
    title: 'ДЕНЬ 5 - Звонки',
    text: `Сегодня ты узнаешь:
• Как выходить на звонок
• Структуру звонка
• Первые скрипты
• Страхи и возражения

Фишки: Живые звонки с клиентами
Ученики присутствуют на реальных звонках топ-агентов и слушают, как закрываются сделки вживую или делают записи для прослушивания (надо показать пример, не только по скриптам).`,
    materials: [
      {
        title: 'Как выходить на звонок',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_5_1'
      },
      {
        title: 'Структура звонка',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_5_2'
      },
      {
        title: 'Первые скрипты',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_5_3'
      },
      {
        title: 'Страхи и возражения',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_5_4'
      }
    ],
    homeworkUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSfyr5smdXx1UoLXYeVIq288XMD7qh2lI2Xhd-g6eZOBAkJLPQ/viewform?usp=header',
    homeworkText: `Домашнее задание:
• Выписать структуру идеального звонка
• Написать короткий скрипт первого звонка клиенту
• Перечислить основные страхи клиентов и варианты ответов на них
• Опишите ситуацию, в которой вам пришлось взять ответственность. Чем всё закончилось?
• Подготовить 3 примера возражений и способы их отработки
• Изучить проект Smart Development Summer 365 + ТЕСТ`
  },
  {
    title: 'ДЕНЬ 6 - Воронка продаж и работа с возражениями',
    text: `Сегодня ты узнаешь:
• Что такое воронка продаж в недвижимости
• Этапы воронки: лид → контакт → интерес → решение → сделка
• Технику СПВ (свойство – преимущество – выгода)
• Отработку ключевых возражений клиента: «дорого», «я подумаю», «я сравниваю», «мне не срочно»

Техника СПВ есть в базе знаний.`,
    materials: [
      {
        title: 'Что такое воронка продаж в недвижимости',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_6_1'
      },
      {
        title: 'Этапы воронки',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_6_2'
      },
      {
        title: 'Техника СПВ (свойство – преимущество – выгода)',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_6_3'
      },
      {
        title: 'Отработка возражений',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_6_4'
      }
    ],
    homeworkUrl: 'https://forms.gle/mG3RHbaMdmeh6QmH6',
    homeworkText: `Домашнее задание:
• Выписать этапы воронки продаж и роль агента на каждом этапе
• Разобрать одно возражение по технике СПВ (на выбор)
• Написать пример ответа клиенту на возражение «дорого»
• Подготовить вариант следующего шага для клиента после отказа
• Как вы планируете развиваться в профессии в первые 3–6 месяцев работы?
• Изучить проект SILK: Silk Towers - Green Cape Botanico + ТЕСТ`
  },
  {
    title: 'ДЕНЬ 7 - Отработка возражений и этапы сделки',
    text: `Сегодня ты узнаешь:
• Работу с возражениями клиента
• Документы по сделке
• Этапы сделки
• Бронирование
• Договоры

Работа с возражениями клиента есть в базе знаний.`,
    materials: [
      {
        title: 'Работа с возражениями клиента',
        url: 'https://docs.google.com/document/d/16LbJ32XC_PCpIwBXhwYCfJY23kpiHFnz5UxWUfR-IVI/edit?tab=t.gw7jr0g0jvjo'
      },
      {
        title: 'Документы по сделке',
        url: 'https://docs.google.com/document/d/16LbJ32XC_PCpIwBXhwYCfJY23kpiHFnz5UxWUfR-IVI/edit?tab=t.gw7jr0g0jvjo'
      },
      {
        title: 'Этапы сделки',
        url: 'https://docs.google.com/document/d/16LbJ32XC_PCpIwBXhwYCfJY23kpiHFnz5UxWUfR-IVI/edit?tab=t.gw7jr0g0jvjo'
      },
      {
        title: 'Бронирование',
        url: 'https://docs.google.com/document/d/16LbJ32XC_PCpIwBXhwYCfJY23kpiHFnz5UxWUfR-IVI/edit?tab=t.ija76gadxnv9'
      },
      {
        title: 'Договоры',
        url: 'https://docs.google.com/document/d/16LbJ32XC_PCpIwBXhwYCfJY23kpiHFnz5UxWUfR-IVI/edit?tab=t.6y9slqffocy5'
      }
    ],
    homeworkUrl: 'https://docs.google.com/forms/d/e/1FAIpQLScmcBLgDfq6vju-D4A8mfZ-jYPI56tY1BVaH6Kmkt0kYQNm6A/viewform?usp=header',
    homeworkText: `Домашнее задание:
• Выписать основные этапы сделки от первого контакта до подписания договора
• Перечислить документы, необходимые для сделки
• Описать процесс бронирования объекта
• Если вы не знаете ответ на вопрос клиента, как вы поступите?
• Подготовить 3 возражения клиента и варианты их отработки
• Изучить проект Pontus Rotana + ТЕСТ`
  },
  {
    title: 'ДЕНЬ 8 - Психотипы клиентов и показы',
    text: `Сегодня ты узнаешь:
• Психотипы клиентов
• Разбор целевой аудитории
• Подготовку к показу объекта
• Как вести клиента на показе
• Типовые ошибки при показах

Знакомство с РОПом Василием Каракезиди: запись видео-знакомства или проведение Zoom-встречи (мотивационный блок). Обсуждение психотипов клиентов.

Разбор целевой аудитории есть в базе знаний.`,
    materials: [
      {
        title: 'Психотипы клиентов',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_8_1'
      },
      {
        title: 'Разбор целевой аудитории',
        url: 'https://docs.google.com/document/d/1JIHhJVjWAw_luE8czJqKn7ru5UTIvRRN9K8n18_v1BE/edit?tab=t.v6twkus3zx7b'
      },
      {
        title: 'Подготовка к показу объекта',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_8_3'
      },
      {
        title: 'Как вести клиента на показе',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_8_4'
      },
      {
        title: 'Типовые ошибки при показах',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_8_5'
      }
    ],
    homeworkUrl: 'https://forms.gle/noHwcAbF1rJxGU8D8',
    homeworkText: `Домашнее задание:
• Описать основные психотипы клиентов и их особенности
• Определить целевую аудиторию для разных типов объектов
• Выписать этапы подготовки к показу
• Перечислить типовые ошибки агентов на показах
• Что для вас значит профессиональная этика в работе с клиентами?
• Изучить проект Symbol Monogram + ТЕСТ`
  },
  {
    title: 'ДЕНЬ 9 - Чек-листы агента',
    text: `Сегодня ты узнаешь:
• Чек-лист звонка
• Чек-лист встречи
• Чек-лист сделки

Эти инструменты помогут тебе структурировать работу и ничего не упустить!`,
    materials: [
      {
        title: 'Чек-лист звонка',
        url: 'https://docs.google.com/document/d/10DNi9qd4AseI-sswsUKWdJLbKI1_DRukZL_ZGzArKao/edit?tab=t.0'
      },
      {
        title: 'Чек-лист встречи',
        url: 'https://docs.google.com/document/d/10DNi9qd4AseI-sswsUKWdJLbKI1_DRukZL_ZGzArKao/edit?tab=t.s2c0d5n0o5mz'
      },
      {
        title: 'Чек-лист сделки',
        url: 'https://docs.google.com/document/d/10DNi9qd4AseI-sswsUKWdJLbKI1_DRukZL_ZGzArKao/edit?tab=t.oshrtcvv96yp'
      }
    ],
    homeworkUrl: 'https://forms.gle/6KN3ujeuyQCxovU27',
    homeworkText: `Домашнее задание:
• Составить чек-лист первого звонка клиенту
• Составить чек-лист личной встречи или Zoom-встречи
• Составить чек-лист сопровождения сделки
• Готовы ли вы работать с большим количеством информации, учиться ежедневно и выполнять план? Почему?
• Изучить проект Queen's Residence + ТЕСТ`
  },
  {
    title: 'ДЕНЬ 10 - Итог теории',
    text: `Поздравляем! Ты завершил теоретический курс! 🎓

Сегодня:
• Разбор вопросов
• Тестирование
• Допуск к практике

Знакомство с РОПом Андреем Бабучем: запись видео-знакомства или проведение Zoom-встречи (мотивационный блок).

Теперь ты готов применить все знания на практике!

Успехов! 🚀`,
    materials: [
      {
        title: 'Разбор вопросов',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_10_1'
      },
      {
        title: 'Тестирование',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_10_2'
      },
      {
        title: 'Допуск к практике',
        url: 'https://docs.google.com/document/d/YOUR_DOC_ID_10_3'
      }
    ],
    homeworkUrl: 'https://forms.gle/mGkCSHcv2YS9Hs666',
    homeworkText: `Домашнее задание:
• Расскажите своими словами: что вы вынесли из обучения, чем оно было полезно лично для вас и какие цели ставите перед собой дальше?
• Опишите, как обучение повлияло на ваше понимание проектов и работы с клиентами. Что вы уже готовы применять на практике?
• Как бы вы описали это обучение? Какие знания вы получили и какие навыки хотели бы развить дальше?
• Поделитесь своими впечатлениями от обучения: что нового вы узнали, что изменилось в вашем понимании продукта и какие шаги вы планируете сделать дальше?
• Что из пройденного обучения оказалось для вас наиболее полезным? Какие инструменты или подходы вы планируете использовать в ближайшее время?
• Опишите, пожалуйста: как вы оцениваете обучение, какие знания или инсайты были для вас самыми ценными и как вы планируете применять их в работе?
• Рассматриваете ли вы возможность дальнейшего профессионального развития в сфере недвижимости совместно с компанией Pon Estate?
• Изучить проект Ambassadori Island + ТЕСТ`
  }
]

// Допоміжна функція для отримання сьогоднішньої дати
function today() {
  return new Date().toISOString().split('T')[0]
}

// Обробка команди /activate для активації коду доступу
bot.command('activate', async (ctx) => {
  try {
    const telegramId = ctx.from.id
    const code = ctx.message.text.split(' ')[1]?.toUpperCase().trim()

    if (!code) {
      return ctx.reply('❌ Пожалуйста, укажите код доступа.\n\nИспользование: /activate ВАШ_КОД')
    }

    // Перевіряємо код
    const codeResult = await pool.query(
      'SELECT * FROM access_codes WHERE code = $1',
      [code]
    )

    if (!codeResult.rows.length) {
      return ctx.reply('❌ Код доступа не найден. Проверьте правильность ввода.')
    }

    const accessCode = codeResult.rows[0]

    if (accessCode.is_used) {
      return ctx.reply('❌ Этот код уже был использован.')
    }

    // Активируємо код та надаємо доступ користувачу
    await pool.query('BEGIN')

    try {
      // Позначаємо код як використаний
      await pool.query(
        'UPDATE access_codes SET is_used = TRUE, used_by_telegram_id = $1, used_at = NOW() WHERE code = $2',
        [telegramId, code]
      )

      // Створюємо або оновлюємо користувача з доступом
      await pool.query(`
        INSERT INTO users (telegram_id, has_access, current_lesson, last_lesson_date, created_at)
        VALUES ($1, TRUE, 1, $2, NOW())
        ON CONFLICT (telegram_id) 
        DO UPDATE SET has_access = TRUE
      `, [telegramId, today()])

      await pool.query('COMMIT')

      await ctx.reply(
        '✅ Код доступа активирован! Теперь вы можете использовать бота.\n\nНапишите /start для начала обучения.',
        Markup.keyboard([['/start']]).resize()
      )
    } catch (err) {
      await pool.query('ROLLBACK')
      throw err
    }
  } catch (error) {
    console.error('Помилка в /activate:', error)
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.')
  }
})

// Обробка команди /start
bot.start(async (ctx) => {
  try {
    const telegramId = ctx.from.id
    const username = ctx.from.username || ctx.from.first_name

    // Перевіряємо чи має користувач доступ
    const userResult = await pool.query(
      'SELECT has_access FROM users WHERE telegram_id = $1',
      [telegramId]
    )

    if (!userResult.rows.length || !userResult.rows[0].has_access) {
      return ctx.reply(
        '🔒 Для доступа к боту необходимо активировать код доступа.\n\n' +
        'Используйте команду: /activate ВАШ_КОД\n\n' +
        'Если у вас нет кода, обратитесь к администратору.'
      )
    }

    // Створюємо або оновлюємо користувача
    // При /start завжди встановлюємо current_lesson = 1 та last_lesson_date = поточна дата
    const todayDate = today()
    console.log('🔍 /start команда:')
    console.log(`   Telegram ID: ${telegramId}`)
    console.log(`   Username: ${username}`)
    console.log(`   Сегодняшняя дата: ${todayDate}`)
    
    await pool.query(`
      UPDATE users 
      SET current_lesson = 1, last_lesson_date = $2
      WHERE telegram_id = $1
    `, [telegramId, todayDate])
    
    console.log(`   ✅ Пользователь обновлен: current_lesson=1, last_lesson_date=${todayDate}`)

    const lesson = lessons[0]
    
    // Форматуємо повідомлення
    let message = `📘 ${lesson.title}\n\n${lesson.text}\n\n`
    
    // Додаємо матеріали
    if (lesson.materials && lesson.materials.length > 0) {
      message += `📄 Материалы:\n`
      lesson.materials.forEach((material, index) => {
        message += `${index + 1}. ${material.title}\n${material.url}\n\n`
      })
    } else if (lesson.materialUrl) {
      message += `📄 Материал:\n${lesson.materialUrl}\n\n`
    }
    
    // Додаємо домашнє завдання
    if (lesson.homeworkText) {
      message += `${lesson.homeworkText}\n\n`
    }
    if (lesson.homeworkUrl) {
      message += `📝 Ссылка на тест:\n${lesson.homeworkUrl}\n\n`
    }
    
    // Додаємо додатковий текст (якщо є)
    if (lesson.additionalText) {
      message += `${lesson.additionalText}\n\n`
    }
    
    message += `После выполнения вернитесь завтра и нажмите "Продолжить".`
    
    await ctx.reply(
      `Добро пожаловать, ${username}! 👋\n\n${message}`,
      Markup.keyboard([['Продолжить ▶️']]).resize()
    )
  } catch (error) {
    console.error('Помилка в /start:', error)
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.')
  }
})

// Обробка кнопки "Продолжить ▶️"
bot.hears('Продолжить ▶️', async (ctx) => {
  try {
    const telegramId = ctx.from.id

    // Отримуємо дані користувача
    const result = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    )

    if (!result.rows.length) {
      return ctx.reply('❌ Сначала напишите /start')
    }

    const user = result.rows[0]

    // Перевіряємо чи має користувач доступ
    if (!user.has_access) {
      return ctx.reply(
        '🔒 Для доступа к урокам необходимо активировать код доступа.\n\n' +
        'Используйте команду: /activate ВАШ_КОД\n\n' +
        'Если у вас нет кода, обратитесь к администратору.'
      )
    }

    const todayDate = today()
    
    // Логування для тестування
    console.log('🔍 Проверка доступа к уроку:')
    console.log(`   Telegram ID: ${telegramId}`)
    console.log(`   Текущий урок: ${user.current_lesson}`)
    console.log(`   Последний урок (дата): ${user.last_lesson_date ? user.last_lesson_date.toISOString().split('T')[0] : 'null'}`)
    console.log(`   Сегодняшняя дата: ${todayDate}`)

    // Перевірка чи можна отримати новий урок (1 урок = 1 день)
    // ВРЕМЕННО ЗАКОМЕНТИРОВАНО ДЛЯ ТЕСТИРОВАНИЯ - можно просмотреть все уроки сразу
    /*
    if (user.last_lesson_date) {
      const lastLessonDateStr = user.last_lesson_date.toISOString().split('T')[0]
      if (lastLessonDateStr === todayDate) {
        console.log('   ❌ Доступ запрещен: урок уже получен сегодня')
        return ctx.reply('⏳ Следующий урок будет доступен завтра.')
      }
      console.log('   ✅ Доступ разрешен: последний урок был в другой день')
    } else {
      console.log('   ✅ Доступ разрешен: last_lesson_date не установлен')
    }
    */
    console.log('   ⚠️ ТЕСТОВЫЙ РЕЖИМ: проверка даты отключена')

    // Перевірка чи завершено курс (якщо вже пройдено всі 10 уроків)
    if (user.current_lesson > lessons.length) {
      return ctx.reply('🎓 Курс завершен.\nСпасибо за прохождение обучения.')
    }

    // Якщо користувач завершив останній урок (10-й) і натискає "Продолжить" наступного дня
    if (user.current_lesson === lessons.length) {
      // Оновлюємо current_lesson, щоб позначити курс як завершений
      await pool.query(
        'UPDATE users SET current_lesson = $1, last_lesson_date = $2 WHERE telegram_id = $3',
        [lessons.length + 1, todayDate, telegramId]
      )
      return ctx.reply('🎓 Курс завершен.\nСпасибо за прохождение обучения.')
    }

    // Визначаємо наступний урок
    let nextLessonNumber = user.current_lesson

    // Якщо це перший урок і він ще не пройдений сьогодні
    if (user.current_lesson === 1 && (!user.last_lesson_date || user.last_lesson_date.toISOString().split('T')[0] !== todayDate)) {
      // Вже показали перший урок в /start, тому переходимо до другого
      nextLessonNumber = 2
    } else if (user.current_lesson < lessons.length) {
      nextLessonNumber = user.current_lesson + 1
    }

    // Оновлюємо дані користувача
    await pool.query(
      'UPDATE users SET current_lesson = $1, last_lesson_date = $2 WHERE telegram_id = $3',
      [nextLessonNumber, todayDate, telegramId]
    )
    console.log(`   ✅ Урок обновлен: current_lesson=${nextLessonNumber}, last_lesson_date=${todayDate}`)

    const lesson = lessons[nextLessonNumber - 1]

    // Форматуємо повідомлення
    let message = `📘 ${lesson.title}\n\n${lesson.text}\n\n`
    
    // Додаємо матеріали
    if (lesson.materials && lesson.materials.length > 0) {
      message += `📄 Материалы:\n`
      lesson.materials.forEach((material, index) => {
        message += `${index + 1}. ${material.title}\n${material.url}\n\n`
      })
    } else if (lesson.materialUrl) {
      message += `📄 Материал:\n${lesson.materialUrl}\n\n`
    }
    
    // Додаємо домашнє завдання
    if (lesson.homeworkText) {
      message += `${lesson.homeworkText}\n\n`
    }
    if (lesson.homeworkUrl) {
      message += `📝 Ссылка на тест:\n${lesson.homeworkUrl}\n\n`
    }
    
    // Додаємо додатковий текст (якщо є)
    if (lesson.additionalText) {
      message += `${lesson.additionalText}\n\n`
    }
    
    message += `После выполнения вернитесь завтра и нажмите "Продолжить".`

    // Відправляємо урок
    await ctx.reply(
      message,
      Markup.keyboard([['Продолжить ▶️']]).resize()
    )
  } catch (error) {
    console.error('Помилка в "Продолжить":', error)
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.')
  }
})


// Обробка команди /status (перевірка прогресу)
bot.command('status', async (ctx) => {
  try {
    const telegramId = ctx.from.id

    const result = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    )

    if (!result.rows.length) {
      return ctx.reply('❌ Сначала напишите /start')
    }

    const user = result.rows[0]
    const progress = Math.round((user.current_lesson / lessons.length) * 100)

    await ctx.reply(
      `📊 Ваш прогресс:\n\n` +
      `Урок: ${user.current_lesson} из ${lessons.length}\n` +
      `Прогресс: ${progress}%\n` +
      `Последний урок: ${user.last_lesson_date ? user.last_lesson_date.toISOString().split('T')[0] : 'еще не пройден'}`
    )
  } catch (error) {
    console.error('Помилка в /status:', error)
    ctx.reply('❌ Произошла ошибка')
  }
})

// Обробка помилок
bot.catch((err, ctx) => {
  console.error('Помилка в боті:', err)
  ctx.reply('❌ Произошла непредвиденная ошибка. Попробуйте позже.')
})

// Graceful shutdown
process.once('SIGINT', async () => {
  console.log('🛑 Отримано SIGINT, зупиняємо сервер...')
  try {
    await bot.telegram.deleteWebhook()
    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error('Помилка при закритті:', err)
    process.exit(1)
  }
})

process.once('SIGTERM', async () => {
  console.log('🛑 Отримано SIGTERM, зупиняємо сервер...')
  try {
    await bot.telegram.deleteWebhook()
    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error('Помилка при закритті:', err)
    process.exit(1)
  }
})

