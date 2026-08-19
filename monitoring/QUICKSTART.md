# 🚀 Quick Start - Observability Stack

## Запуск за 3 минуты

### 0. Настройка Telegram (опционально, но рекомендуется)

```bash
# 1. Создать бота через @BotFather → получить TOKEN
# 2. Получить свой ID через @userinfobot → получить ADMIN_ID
# 3. Добавить в .env:
cp .env.example .env
nano .env  # или любой редактор

# Заполнить:
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_ID=123456789
```

**Подробнее**: [TELEGRAM_SETUP.md](TELEGRAM_SETUP.md)

### 1. Запустить всё одной командой

```bash
docker compose up -d
```

### 2. Настроить Telegram бота

```
# Открыть бота в Telegram (по username из @BotFather)
/start
/subscribe
```

**Готово!** Теперь все алерты приходят в Telegram 🎉

### 3. Открыть Grafana

Перейти на http://localhost:3000

**Логин**: `admin`  
**Пароль**: `admin` (или из `.env` - `GRAFANA_PASSWORD`)

### 4. Открыть дашборды

В Grafana слева: **Dashboards** → выбрать:
- ✅ **Yoldosh API Dashboard** - метрики API
- ✅ **Yoldosh System Dashboard** - CPU/RAM/Network
- ✅ **Yoldosh PostgreSQL Dashboard** - БД метрики
- ✅ **Yoldosh Logs Dashboard** - логи и фильтры

### 5. Сделать тестовые запросы

```bash
# Сгенерировать трафик
for i in {1..100}; do
  curl http://localhost:5000/api/v1/health
  curl http://localhost:5000/api/v1/trips
done
```

### 6. Проверить метрики

Через 15-30 секунд обновите дашборды в Grafana - увидите графики!

---

## 🎯 Что видно "из коробки"

### API Dashboard
- **RPS** по endpoint'ам
- **Latency** p50/p95/p99
- **Error Rate** (5xx ошибки)
- **HTTP Status** distribution
- **Business metrics**: searches, trips, bookings

### System Dashboard
- **CPU** usage по контейнерам
- **Memory** usage
- **Network I/O**
- **Disk I/O**
- **Redis** status

### PostgreSQL Dashboard
- **Connections** (active)
- **Cache Hit Ratio**
- **Slow Queries** (>5s)
- **Locks** count
- **TPS** (transactions/s)
- **Replication Lag**
- **Database Size**

### Logs Dashboard
- **All logs** from app
- **Error logs** only
- **Filtered logs** by endpoint/status/userId/traceId
- **Log volume** by level
- **PostgreSQL errors**

---

## 🔗 Полезные ссылки

| Сервис | URL | Описание |
|--------|-----|----------|
| Grafana | http://localhost:3000 | Дашборды |
| Prometheus | http://localhost:9090 | Метрики |
| Alertmanager | http://localhost:9093 | Алерты |
| Telegram Bot | @your_bot_username | Алерты в TG 🤖 |
| API Metrics | http://localhost:9100/metrics | Raw metrics |

---

## 🔔 Telegram Alerts

Все critical/warning алерты автоматически отправляются в Telegram:
- 🚨 **Critical**: немедленно (API Down, DB Down, High Error Rate)
- ⚠️ **Warning**: с задержкой 30s (High Latency, High CPU)
- 💼 **Business**: с задержкой 30s (Low Conversion, Low Searches)
- 🗄️ **Database**: с задержкой 15s (Slow Queries, Deadlocks)

**Команды бота**:
```
/start       - запустить бота
/subscribe   - подписаться на алерты
/alerts      - список активных алертов
/silences    - список silence
/help        - справка
```

**Детали**: [TELEGRAM_SETUP.md](TELEGRAM_SETUP.md)

---

## 📊 Добавить бизнес-метрики

В контроллерах:

```typescript
import { trackTripSearch, trackTripCreated } from '../shared/utils/businessMetrics';

// Track trip search
trackTripSearch(true);

// Track trip creation
trackTripCreated();
```

Полный список метрик см. в `shared/utils/businessMetrics.ts`

---

## 🛑 Остановить всё

```bash
docker compose down
```

---

## 📖 Полная документация

См. [monitoring/README.md](./README.md)

**Готово! 🎉**
