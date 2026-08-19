# 🚀 Yoldosh Monitoring Stack - Production Ready

## ✅ Что Сделано

### 1. ❌ Убран cAdvisor
- **Причина**: Избыточен при наличии Loki/Promtail/Prometheus
- **Что осталось**: Prometheus (метрики приложения), Loki (логи), Promtail (агент логов)
- **Экономия**: ~256MB RAM, 0.3 CPU

### 2. 📊 Улучшены Метрики Приложения

#### Новые метрики:
```typescript
// Пользователи
total_users                    // Всего зарегистрировано
active_users_current          // Активны за 24 часа
user_registration_total{role} // Регистрации (driver/passenger)
user_login_total{status}      // Логины (success/failed)

// Заявки водителей
driver_applications_total{status}  // pending/approved/rejected

// Метрики по роутам
route_request_duration_seconds{method,route,status}  // Длительность запросов
route_request_total{method,route,status}             // Количество запросов
route_errors_total{method,route,error_type}          // Ошибки по роутам
```

#### Автоматическое обновление:
- **Воркер метрик**: Обновляет gauge метрики каждые 60 секунд
- **Данные из БД**: Подсчет пользователей, заявок, активности
- **Connection Pool**: Мониторинг состояния пула подключений БД

### 3. 📈 Новые Дашборды Grafana

#### API Dashboard Enhanced (`api-enhanced.json`)
- 📊 **User Statistics**: Total Users, Active Users (24h)
- 🚗 **Driver Applications**: Статусы заявок (pie chart)
- 🔥 **Requests per Second**: По каждому роуту
- ⚡ **Request Duration**: p95, p99 по роутам
- ❌ **Errors by Route**: Детализация ошибок
- 🎯 **Main Routes Stats**: Количество запросов к главным эндпоинтам
- 📈 **Business Metrics**: Trips, Bookings, Payments за час
- 🔄 **HTTP Status Codes**: Распределение статусов
- 💾 **Response Size**: Средний размер ответов

#### Logs Dashboard Enhanced (`logs-enhanced.json`)
- 🔴 **Critical & Error Logs**: Только критичные ошибки
- ⚠️ **Warning Logs**: Предупреждения
- ℹ️ **Info Logs**: Информационные сообщения
- 🐛 **Debug Logs**: Отладочная информация
- 📊 **Log Level Distribution**: Распределение по уровням
- 🔥 **Errors Rate**: График частоты ошибок
- 🚦 **Логи по роутам**:
  - `/api/auth/*` - Аутентификация
  - `/api/trips/*` - Поездки
  - `/api/bookings/*` - Бронирования
  - `/api/payments/*` - Платежи
  - `/api/users/*` - Пользователи
  - `/api/admin/*` - Администрирование
- 🗄️ **Database Logs**: Логи PostgreSQL
- 💾 **Redis Logs**: Логи Redis

#### PostgreSQL Dashboard (`postgres-enhanced.json`)
- 🗄️ **Connections**: Активные подключения
- ⚡ **Transactions per Second**: Commits/Rollbacks
- 📊 **Cache Hit Ratio**: % попаданий в кеш
- ⏱️ **Query Duration**: p95 по операциям
- 🔗 **Connection Pool**: Total/Active/Idle
- 📈 **Tuples Operations**: Insert/Update/Delete/sec
- 🔐 **Deadlocks**: Количество дедлоков
- 📉 **Table Bloat**: Топ 10 таблиц по dead tuples

#### System Dashboard (`system-enhanced.json`)
- 💻 **CPU Usage**: Node.js процесс
- 🧠 **Memory Usage**: RSS память
- ⏱️ **Event Loop Lag**: Задержка event loop
- 🗑️ **Garbage Collection**: Длительность GC
- 📊 **Heap Memory**: Used/Total
- 🔗 **Active Handles**: Открытые handles
- 📝 **Active Requests**: Активные запросы
- ⏰ **Process Uptime**: Время работы
- 💾 **Redis Memory**: Used/Max
- ⚡ **Redis Operations**: Commands/sec
- 🔄 **Redis Hit Rate**: % попаданий в кеш
- 🔢 **Redis Keys**: Количество ключей

### 4. 🔔 Исправлен Alertmanager

#### Проблемы были:
- ❌ Неправильный URL для default receiver
- ❌ Не все receivers отправляли в Telegram

#### Исправлено:
- ✅ Все receivers используют `alertmanager-bot:8080`
- ✅ Настроен `max_alerts: 10` для каждого receiver
- ✅ Включен `send_resolved: true` для уведомлений о восстановлении

#### Команды Telegram Бота:
```bash
/start          # Начать работу с ботом
/subscribe      # Подписаться на алерты
/unsubscribe    # Отписаться от алертов
/status         # Статус Alertmanager
/silence        # Список silence rules
/help           # Помощь
```

### 5. 🏗️ Архитектура (как в Яндексе)

#### Принципы High-Load оптимизации:

1. **Low Cardinality Metrics**
   - Нормализация эндпоинтов (UUID → :uuid, числа → :id)
   - Группировка по основным параметрам
   - Избегание уникальных labels

2. **Efficient Scraping**
   - Prometheus: 15-30s intervals
   - App metrics: 10s (критичные данные)
   - DB/Redis: 15s (стабильные метрики)

3. **Smart Bucketing**
   - HTTP: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
   - DB: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
   - Redis: [0.001, 0.01, 0.05, 0.1, 0.5, 1]

4. **Async Metrics Updates**
   - Gauge metrics обновляются в фоне (60s)
   - Не блокируют основной поток
   - Используют пул подключений БД

5. **Resource Management**
   - Удален cAdvisor (экономия 256MB)
   - Prometheus retention: 7 days (5GB)
   - Loki retention: 7 days
   - Grafana: только warn level logs

---

## 🚀 Запуск

### 1. Настройте .env файл

```env
# Telegram (обязательно!)
TELEGRAM_BOT_TOKEN=your_bot_token_from_@BotFather
TELEGRAM_ADMIN_ID=your_telegram_id_from_@userinfobot

# PostgreSQL
DB_USER=yoldosh
DB_PASSWORD=secure_password
DB_NAME=yoldosh_prod

# Grafana
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin
```

### 2. Запустите стек

```bash
# Пересобрать приложение с новыми метриками
docker compose build yoldosh-service

# Запустить все сервисы
docker compose up -d

# Проверить статус
docker compose ps

# Логи приложения
docker compose logs -f yoldosh-service
```

### 3. Откройте дашборды

- **Grafana**: http://localhost:3000
  - Login: `admin` / `admin`
  - Dashboards → Browse → Выбрать дашборд
  
- **Prometheus**: http://localhost:9090
  - Status → Targets (проверить все green)
  
- **Alertmanager**: http://localhost:9093
  - Alerts → Активные алерты

### 4. Настройте Telegram

```bash
# 1. Создайте бота через @BotFather
/newbot
# Получите TOKEN

# 2. Узнайте свой ID через @userinfobot
/start

# 3. Добавьте в .env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ADMIN_ID=123456789

# 4. Перезапустите alertmanager-bot
docker compose restart alertmanager-bot

# 5. Откройте вашего бота в Telegram
/start
/subscribe
```

---

## 📊 Проверка Метрик

### Проверить что метрики собираются:

```bash
# 1. Открыть /metrics эндпоинт
curl http://localhost:9100/metrics

# Должны быть видны:
# total_users
# active_users_current
# driver_applications_total{status="pending"}
# route_request_total
# route_request_duration_seconds_bucket

# 2. Проверить в Prometheus
# http://localhost:9090/graph
# Запросы:
total_users
rate(route_request_total[5m])
histogram_quantile(0.95, rate(route_request_duration_seconds_bucket[5m]))
```

### Проверить алерты:

```bash
# 1. Создать тестовый алерт (если настроены алерты)
# В Prometheus → Alerts должны быть видны правила

# 2. Проверить Alertmanager
curl http://localhost:9093/api/v2/alerts

# 3. Проверить Telegram бота
# В Telegram должен прийти алерт
```

---

## 🔧 Troubleshooting

### Метрики не обновляются

```bash
# Проверить логи воркера
docker compose logs yoldosh-service | grep MetricsWorker

# Должно быть:
# [MetricsWorker] Metrics worker started
# [MetricsWorker] Metrics updated successfully
```

### Дашборды пустые

```bash
# 1. Проверить что Prometheus собирает метрики
curl http://localhost:9090/api/v1/query?query=up

# 2. Проверить targets в Prometheus
# http://localhost:9090/targets
# Все должны быть UP (green)

# 3. Перезагрузить Grafana
docker compose restart grafana
```

### Telegram не работает

```bash
# 1. Проверить переменные окружения
docker compose exec alertmanager-bot env | grep TELEGRAM

# 2. Проверить логи бота
docker compose logs alertmanager-bot

# 3. Проверить что бот запущен
curl http://localhost:8081/healthz
```

### PostgreSQL дашборд пустой

```bash
# 1. Проверить postgres-exporter
docker compose logs postgres-exporter

# 2. Проверить метрики
curl http://localhost:9187/metrics | grep pg_stat

# 3. Проверить переменную $database в Grafana
# Dashboard settings → Variables → database
# Должно быть: yoldosh_prod (или ваше имя БД)
```

---

## 📈 Рекомендации по Масштабированию

### При росте нагрузки:

1. **Увеличить retention**:
   ```yaml
   # docker-compose.yml → prometheus
   - '--storage.tsdb.retention.time=30d'
   - '--storage.tsdb.retention.size=20GB'
   ```

2. **Добавить Prometheus Federation**:
   - Несколько Prometheus инстансов
   - Один главный для агрегации

3. **Вынести Loki в отдельный кластер**:
   - S3 backend для хранения
   - Querier/Ingester разделение

4. **Настроить Grafana alerting**:
   - Slack интеграция
   - PagerDuty для критичных алертов
   - Email уведомления

5. **Добавить Jaeger для трейсинга**:
   - Распределенные трейсы
   - Анализ bottlenecks

---

## 📚 Дополнительные Материалы

- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [Loki LogQL](https://grafana.com/docs/loki/latest/logql/)
- [Alertmanager Configuration](https://prometheus.io/docs/alerting/latest/configuration/)

---

## ✅ Checklist

- [ ] `.env` файл настроен (TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_ID)
- [ ] `docker compose up -d` запущен успешно
- [ ] Все targets в Prometheus UP (http://localhost:9090/targets)
- [ ] Grafana доступна (http://localhost:3000)
- [ ] Дашборды видны и показывают данные
- [ ] Telegram бот отвечает на команды
- [ ] Алерты настроены и работают
- [ ] Метрики приложения обновляются (total_users, active_users_current)
- [ ] Логи видны в Loki dashboard
- [ ] PostgreSQL метрики собираются

---

Готово! 🎉 Теперь у вас production-ready observability stack как в Яндексе!
