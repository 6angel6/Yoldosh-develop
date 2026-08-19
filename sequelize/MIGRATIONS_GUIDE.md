# 📚 Полное руководство по миграциям в Sequelize

## Что такое миграции?

**Миграции** - это набор инструкций (версионированный контроль) для изменения структуры базы данных.

Вместо того чтобы вручную запускать SQL-запросы, миграции позволяют:
- ✅ Контролировать версии схемы БД
- ✅ Откатывать изменения (вверх/вниз)
- ✅ Работать в команде без конфликтов
- ✅ Автоматизировать развёртывание

## Структура проекта

```
sequelize/
├── config.js                 # Конфигурация БД для разных окружений
├── migrations/               # Все миграции (история изменений)
│   └── 20241222000001-create-initial-schema.js
├── seeders/                  # Начальные данные (тестовые)
│   └── 20241222000001-seed-initial-users.js
└── models/                   # Sequelize модели (если нужны)
```

## Команды для работы с миграциями

### 1. **Запуск всех ожидающих миграций**
```bash
npm run migrate
# или
npx sequelize-cli db:migrate
```

### 2. **Откат последней миграции**
```bash
npx sequelize-cli db:migrate:undo
```

### 3. **Откат всех миграций**
```bash
npx sequelize-cli db:migrate:undo:all
```

### 4. **Откат до конкретной миграции**
```bash
npx sequelize-cli db:migrate:undo --name 20241222000001-create-initial-schema.js
```

### 5. **Просмотр статуса миграций**
```bash
npx sequelize-cli db:migrate:status
```

### 6. **Запуск сидеров** (добавление тестовых данных)
```bash
npx sequelize-cli db:seed:all
```

### 7. **Откат сидеров**
```bash
npx sequelize-cli db:seed:undo:all
```

## Как создать новую миграцию

### Способ 1: Автогенерация (рекомендуется для начинающих)
```bash
npx sequelize-cli migration:generate --name add-status-to-users
```

Это создаст файл: `20241222120000-add-status-to-users.js`

### Способ 2: Создать вручную

Скопируй файл существующей миграции и отредактируй его.

## Структура файла миграции

```javascript
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Изменения ВПЕРЁД (apply) - добавление/изменение данных
  },

  async down(queryInterface, Sequelize) {
    // Откат НАЗАД - отмена изменений
  },
};
```

## Примеры типичных миграций

### Пример 1: Добавить новый столбец

```javascript
async up(queryInterface, Sequelize) {
  await queryInterface.addColumn('users', 'phone_verified', {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  });
},

async down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('users', 'phone_verified');
},
```

### Пример 2: Создать индекс

```javascript
async up(queryInterface, Sequelize) {
  await queryInterface.addIndex('users', ['email']);
},

async down(queryInterface, Sequelize) {
  await queryInterface.removeIndex('users', ['email']);
},
```

### Пример 3: Добавить ограничение (constraint)

```javascript
async up(queryInterface, Sequelize) {
  await queryInterface.addConstraint('bookings', {
    fields: ['passenger_id'],
    type: 'foreign key',
    name: 'fk_bookings_passenger',
    references: {
      table: 'users',
      field: 'id',
    },
  });
},

async down(queryInterface, Sequelize) {
  await queryInterface.removeConstraint('bookings', 'fk_bookings_passenger');
},
```

### Пример 4: Изменить тип столбца

```javascript
async up(queryInterface, Sequelize) {
  await queryInterface.changeColumn('users', 'rating', {
    type: Sequelize.DECIMAL(5, 2),
    allowNull: true,
  });
},

async down(queryInterface, Sequelize) {
  await queryInterface.changeColumn('users', 'rating', {
    type: Sequelize.DECIMAL(3, 2),
    allowNull: true,
  });
},
```

### Пример 5: Переименовать столбец

```javascript
async up(queryInterface, Sequelize) {
  await queryInterface.renameColumn('users', 'phoneNumber', 'phone_number');
},

async down(queryInterface, Sequelize) {
  await queryInterface.renameColumn('users', 'phone_number', 'phoneNumber');
},
```

### Пример 6: Обновить данные в миграции

```javascript
async up(queryInterface, Sequelize) {
  // Добавить новый столбец
  await queryInterface.addColumn('users', 'status', {
    type: Sequelize.ENUM('active', 'inactive'),
    defaultValue: 'active',
  });
  
  // Обновить существующие записи
  await queryInterface.sequelize.query(
    "UPDATE users SET status = 'active' WHERE verified = true"
  );
},

async down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('users', 'status');
},
```

## Как создать сидер

```bash
npx sequelize-cli seed:generate --name seed-initial-trips
```

Пример структуры:

```javascript
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('trips', [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        driver_id: '123e4567-e89b-12d3-a456-426614174001',
        from_city: 'Ташкент',
        to_city: 'Самарканд',
        from_address: 'ул. Пушкина, д. 10',
        to_address: 'ул. Регистана, д. 5',
        origin_lat: 41.2995,
        origin_lng: 69.2401,
        destination_lat: 39.6548,
        destination_lng: 66.9597,
        departure_time: new Date('2025-01-10 10:00:00'),
        available_seats: 3,
        price_per_seat: 50000,
        status: 'ACTIVE',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('trips', null, {});
  },
};
```

## Лучшие практики

### ✅ ДЕЛАЙ

- ✅ Одна логическая единица = одна миграция
- ✅ Всегда пиши обе части: up и down
- ✅ Используй описательные имена файлов
- ✅ Добавляй комментарии к сложным миграциям
- ✅ Тестируй миграции локально
- ✅ Добавляй сидеры для тестовых данных

### ❌ НЕ ДЕЛАЙ

- ❌ Не редактируй уже примененные миграции
- ❌ Не используй `down` для удаления данных в production
- ❌ Не создавай слишком большие миграции
- ❌ Не забывай про откаты (down)

## Процесс работы в команде

1. **Создаёшь миграцию** на своей ветке
   ```bash
   git checkout -b feature/add-chat-tables
   npx sequelize-cli migration:generate --name create-chat-tables
   ```

2. **Пушишь в git** (с миграцией внутри)
   ```bash
   git add sequelize/migrations/
   git commit -m "Add chat tables migration"
   ```

3. **Коллега тянет код** и запускает
   ```bash
   npm install
   npm run migrate
   ```

4. **Если нужен откат**
   ```bash
   npx sequelize-cli db:migrate:undo
   # или откат всех
   npx sequelize-cli db:migrate:undo:all
   ```

## Отладка

### Проверить статус
```bash
npx sequelize-cli db:migrate:status
```

### Запустить с логами
```bash
NODE_DEBUG=sequelize npx sequelize-cli db:migrate
```

### Посмотреть SQL
```bash
npx sequelize-cli db:migrate --debug
```

## Типы данных в Sequelize

```javascript
Sequelize.STRING       // VARCHAR(255)
Sequelize.INTEGER      // INT
Sequelize.BIGINT       // BIGINT
Sequelize.DECIMAL(10, 2)  // DECIMAL
Sequelize.BOOLEAN      // BOOLEAN
Sequelize.DATE         // TIMESTAMP
Sequelize.UUID         // UUID
Sequelize.TEXT         // TEXT
Sequelize.ENUM('a', 'b')  // ENUM
Sequelize.JSON         // JSON
```

## Проверка работы

### Шаг 1: Убедись, что .env настроен
```env
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=yoldosh_db
DB_HOST=localhost
DB_PORT=5432
```

### Шаг 2: Запусти миграцию
```bash
npm run migrate
```

### Шаг 3: Проверь БД
```sql
-- В PostgreSQL
\dt -- список таблиц
\d users -- описание таблицы users
```

---

**Готов помочь с конкретной миграцией! Напиши, что нужно изменить в БД.**
