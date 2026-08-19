# 🚨 Yoldosh Alerting - Quick Start

## ✅ Что Сделано

### 1. 📋 Созданы Профессиональные Правила Алертов

#### Application Alerts (`app-alerts.yml`)
- **YoldoshServiceDown** - API полностью упал (CRITICAL)
- **HighErrorRate** - Более 5% ошибок 5xx (CRITICAL)
- **SlowResponseTime** - P95 latency > 2s (WARNING)
- **HighMemoryUsage** - Использование > 800MB RAM (WARNING)
- **EventLoopLag** - Event loop lag > 100ms (WARNING)
- **TooManyConnections** - Активных handles > 1000 (CRITICAL)
- **NoNewUserRegistrations** - 2 часа без регистраций (WARNING)
- **HighDriverRejectionRate** - > 50% отклонений водителей (INFO)
- **AuthEndpointErrors** - Ошибки в /api/auth/* (CRITICAL)
- **TripsEndpointSlow** - /api/trips/* > 3s (WARNING)

#### Database Alerts (`database-alerts.yml`)
- **PostgreSQLDown** - БД недоступна (CRITICAL)
- **PostgreSQLTooManyConnections** - > 80 подключений (CRITICAL)
- **PostgreSQLLowCacheHitRatio** - Cache hit < 90% (WARNING)
- **PostgreSQLHighDeadlockRate** - Deadlocks обнаружены (CRITICAL)
- **PostgreSQLSlowQueries** - P95 query time > 1s (WARNING)
- **PostgreSQLHighRollbackRate** - > 10% rollbacks (WARNING)
- **PostgreSQLReplicationLag** - Lag > 60s (CRITICAL)
- **PostgreSQLTableBloat** - > 10000 dead tuples (WARNING)

#### Redis Alerts (`redis-alerts.yml`)
- **RedisDown** - Redis недоступен (CRITICAL)
- **RedisHighMemoryUsage** - > 85% памяти (WARNING)
- **RedisLowHitRate** - Hit rate < 80% (WARNING)
- **RedisTooManyKeys** - > 1M ключей (WARNING)
- **RedisBlockedClients** - > 10 заблокированных клиентов (CRITICAL)
- **RedisEvictions** - Вытеснение ключей (CRITICAL)
- **RedisSlowCommands** - Медленные команды (WARNING)
- **RedisRDBLastSaveFailed** - Ошибка сохранения RDB (CRITICAL)

### 2. 📱 Telegram Интеграция

**Формат алертов:**
```
🚨 CRITICAL

🚨 YOLDOSH API ПОЛНОСТЬЮ УПАЛ

Приложение Yoldosh не отвечает больше 1 минуты.
📍 Где: yoldosh-app
⏰ Время: 12:30:00 20.01.2026

🔧 ДЕЙСТВИЯ:
1. Проверить: docker ps | grep yoldosh-service
2. Логи: docker logs yoldosh-service --tail 100
3. Перезапуск: docker restart yoldosh-service

⚠️ Статус: Активен

━━━━━━━━━━━━━━━━━━━
```

## 🚀 Быстрый Старт

### 1. Проверьте .env файл

```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_@BotFather
TELEGRAM_ADMIN_ID=your_telegram_id_from_@userinfobot
```

### 2. Откройте бота в Telegram

Найдите вашего бота и отправьте:
```
/start
```

Бот автоматически подпишет вас на все алерты.

### 3. Проверьте статус

```
/status  - Статус Alertmanager и бота
/alerts  - Все активные алерты
/chats   - Кто подписан на алерты
```

## 🔍 Тестирование Алертов

### Проверить загрузку правил:
```bash
# Открыть Prometheus UI
http://localhost:9090/alerts

# Должны быть видны все правила
```

### Создать тестовый алерт:
```bash
# Остановить сервис
docker stop yoldosh-service

# Подождать 1 минуту - должен прийти алерт:
# "🚨 YOLDOSH API ПОЛНОСТЬЮ УПАЛ"

# Запустить обратно
docker start yoldosh-service

# Через минуту придет:
# "✅ RESOLVED"
```

## 📊 Мониторинг в Prometheus

### Открыть UI:
```
http://localhost:9090
```

### Полезные запросы:

**Проверить что сервис работает:**
```promql
up{job="yoldosh-app"}
```

**Error rate:**
```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

**P95 latency:**
```promql
histogram_quantile(0.95, 
  rate(http_request_duration_seconds_bucket[5m])
)
```

**Активные пользователи:**
```promql
active_users_current
```

## 🔧 Настройка Алертов

### Изменить порог:

Отредактируйте файл:
```
monitoring/prometheus/alerts/app-alerts.yml
```

Например, изменить error rate с 5% на 10%:
```yaml
- alert: HighErrorRate
  expr: |
    (
      sum(rate(http_requests_total{status=~"5.."}[5m]))
      /
      sum(rate(http_requests_total[5m]))
    ) > 0.10  # Было 0.05
```

Перезагрузить Prometheus:
```bash
docker compose restart prometheus
```

### Добавить новый алерт:

1. Открыть `monitoring/prometheus/alerts/app-alerts.yml`
2. Добавить правило:
```yaml
- alert: MyCustomAlert
  expr: my_metric > 100
  for: 5m
  labels:
    severity: warning
    component: application
    team: backend
  annotations:
    summary: "⚠️ КРАТКОЕ ОПИСАНИЕ"
    description: "Детальное описание проблемы\n\n🔧 Что делать:\n- Шаг 1\n- Шаг 2"
```
3. Перезапустить: `docker compose restart prometheus`

## 🔕 Заглушить Алерт

### В Telegram:
```
/silences
```

### В Alertmanager UI:
```
http://localhost:9093/#/silences
```

1. Нажать "New Silence"
2. Указать matcher (например `alertname="HighErrorRate"`)
3. Указать длительность (например 2h)
4. Добавить комментарий
5. Create

## 📈 Best Practices

### Severity Уровни:

- **CRITICAL** 🚨
  - Сервис полностью упал
  - Данные под угрозой
  - Пользователи не могут работать
  - **Действие:** Немедленно исправить

- **WARNING** ⚠️
  - Деградация производительности
  - Приближение к лимитам
  - Потенциальные проблемы
  - **Действие:** Исправить в течение часа

- **INFO** ℹ️
  - Бизнес-метрики
  - Аномалии в поведении
  - Статистика
  - **Действие:** Изучить позже

### Частота Алертов:

- CRITICAL: каждые 5 минут (repeat_interval: 5m)
- WARNING: каждые 3 часа (repeat_interval: 3h)
- INFO: раз в 24 часа (repeat_interval: 24h)

### Группировка:

Алерты группируются по:
- `alertname` - имя алерта
- `cluster` - кластер
- `service` - сервис
- `component` - компонент

## 🆘 Troubleshooting

### Алерты не приходят в Telegram

1. **Проверить бота:**
```bash
docker compose logs alertmanager-bot --tail 50
```

2. **Проверить что бот работает:**
```bash
curl http://localhost:8081/healthz
```

3. **Проверить переменные окружения:**
```bash
docker compose exec alertmanager-bot env | grep TELEGRAM
```

### Prometheus не видит правила

1. **Проверить синтаксис YAML:**
```bash
# Установить promtool
docker run --rm -v ${PWD}/monitoring/prometheus/alerts:/alerts prom/prometheus:latest promtool check rules /alerts/app-alerts.yml
```

2. **Проверить логи:**
```bash
docker compose logs prometheus | grep -i error
```

### Alertmanager не отправляет на webhook

1. **Проверить конфигурацию:**
```bash
curl http://localhost:9093/api/v1/status
```

2. **Проверить receivers:**
```yaml
# monitoring/alertmanager/alertmanager.yml
receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://alertmanager-bot:8080/alerts'  # Правильный URL
```

## 📞 Контакты

При критических проблемах:
1. Открыть Grafana: http://localhost:3000
2. Проверить дашборды
3. Проверить логи: `docker compose logs -f yoldosh-service`
4. Telegram: отправить `/alerts` боту

---

**Готово! 🎉** Теперь у вас production-ready alerting система!
