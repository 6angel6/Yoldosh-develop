# 🔔 Настройка Telegram для Alertmanager

## Быстрый старт

### 1. Создать Telegram бота

1. Открыть [@BotFather](https://t.me/BotFather) в Telegram
2. Отправить команду: `/newbot`
3. Придумать имя бота, например: `Yoldosh Alerts`
4. Придумать username бота, например: `yoldosh_alerts_bot`
5. **Сохранить токен**, который даст BotFather (формат: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Получить свой Telegram ID

1. Открыть [@userinfobot](https://t.me/userinfobot) в Telegram
2. Отправить любое сообщение
3. **Сохранить ID** (формат: `123456789`)

### 3. Добавить переменные в .env

Открыть файл `.env` в корне проекта и добавить:

```bash
# Telegram Bot для алертов
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_ID=123456789
```

**Важно**: Замените значения на свои токен и ID!

### 4. Запустить мониторинг

```bash
docker compose down
docker compose up -d
```

### 5. Подписаться на алерты

1. Открыть бота в Telegram (поиск по username: `@yoldosh_alerts_bot`)
2. Отправить команду: `/start`
3. Отправить команду: `/subscribe`

**Готово!** Теперь все алерты будут приходить в Telegram.

---

## Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Запуск бота |
| `/help` | Справка по командам |
| `/subscribe` | Подписаться на все алерты |
| `/unsubscribe` | Отписаться от алертов |
| `/status` | Статус Alertmanager |
| `/alerts` | Список активных алертов |
| `/silences` | Список активных silence |
| `/chats` | Список подписанных чатов (только админ) |

---

## Типы алертов в Telegram

### 🚨 Critical (критичные)
- Приходят **немедленно**
- Требуют **срочного** реагирования
- Примеры: API Down, PostgreSQL Down, High Error Rate

**Формат сообщения:**
```
🚨 🌐 APIDown

Severity: critical
Component: api
Instance: yoldosh-app:9100

Summary: API is down
Description: API endpoint is not responding

Status: firing
Started: 2026-01-17 15:30:00

📈 View in Prometheus | 🔇 Silence
```

### ⚠️ Warning (предупреждения)
- Приходят с **задержкой 30с** (группировка)
- Требуют внимания, но не критичны
- Примеры: High Latency, High CPU Usage

### ℹ️ Info (информационные)
- Приходят раз в **24 часа** (если не resolved)
- Просто информация, не требует действий

### 💼 Business (бизнес-метрики)
- Приходят с **задержкой 30с** (группировка)
- Низкая конверсия, мало поисков/бронирований

### 🗄️ Database (база данных)
- Приходят с **задержкой 15с**
- Slow queries, deadlocks, connections

---

## Групповые чаты

Чтобы алерты приходили в **групповой чат**:

1. Создать группу в Telegram
2. Добавить бота в группу (через @username)
3. **Сделать бота администратором** группы
4. Отправить в группе: `/subscribe`

Теперь все участники группы будут видеть алерты.

---

## Настройка Silence (отключение алертов)

### Через бота

```
/silence <alertname> <duration>
```

Примеры:
```
/silence HighCPUUsage 2h
/silence PostgresSlowQueries 30m
```

### Через Alertmanager UI

1. Открыть http://localhost:9093
2. Нажать **Silences** → **New Silence**
3. Заполнить форму:
   - **Matchers**: `alertname=HighCPUUsage`
   - **Duration**: `2h`
   - **Creator**: ваше имя
   - **Comment**: причина
4. Нажать **Create**

---

## Кастомизация сообщений

Шаблон сообщений находится в:
```
monitoring/alertmanager/telegram-template.tmpl
```

### Доступные переменные

```go
{{ .Labels.alertname }}      // Имя алерта
{{ .Labels.severity }}       // critical, warning, info
{{ .Labels.component }}      // api, database, system, business
{{ .Labels.instance }}       // yoldosh-app:9100
{{ .Labels.job }}           // yoldosh-app
{{ .Labels.endpoint }}      // /api/trips/search

{{ .Annotations.summary }}      // Краткое описание
{{ .Annotations.description }}  // Полное описание
{{ .Annotations.value }}        // Текущее значение
{{ .Annotations.threshold }}    // Порог срабатывания

{{ .Status }}               // firing или resolved
{{ .StartsAt }}            // Время начала
{{ .EndsAt }}              // Время окончания
{{ .GeneratorURL }}        // Ссылка на Prometheus
{{ .SilenceURL }}          // Ссылка на создание silence
```

### Эмодзи по severity

```go
{{ define "__alert_severity_emoji" -}}
{{- if eq .Labels.severity "critical" -}}🚨
{{- else if eq .Labels.severity "warning" -}}⚠️
{{- else if eq .Labels.severity "info" -}}ℹ️
{{- else -}}🔔
{{- end -}}
{{- end -}}
```

После изменения шаблона:
```bash
docker compose restart alertmanager alertmanager-bot
```

---

## Множественные админы

Если нужно несколько админов, добавьте через запятую:

```env
TELEGRAM_ADMIN_ID=123456789,987654321,555555555
```

Все админы смогут:
- Управлять подписками
- Создавать silences
- Видеть список чатов

---

## Troubleshooting

### Бот не отвечает

```bash
# Проверить логи
docker logs alertmanager-bot

# Проверить переменные окружения
docker exec alertmanager-bot env | grep TELEGRAM

# Перезапустить
docker compose restart alertmanager-bot
```

### Алерты не приходят

```bash
# 1. Проверить, что подписались
# Отправить боту: /subscribe

# 2. Проверить Alertmanager
curl http://localhost:9093/api/v1/alerts

# 3. Проверить webhook
docker logs alertmanager-bot | grep webhook

# 4. Протестировать алерт вручную
curl -X POST http://localhost:9093/api/v1/alerts \
  -H 'Content-Type: application/json' \
  -d '[{
    "labels": {
      "alertname": "TestAlert",
      "severity": "info"
    },
    "annotations": {
      "summary": "Test alert from curl"
    }
  }]'
```

### Бот не видит команд в группе

1. Убедиться, что бот **администратор** группы
2. Включить **Privacy Mode OFF** в BotFather:
   ```
   /setprivacy -> выбрать бота -> Disable
   ```

### Дубли сообщений

Проверить `group_interval` в [alertmanager.yml](alertmanager.yml):
```yaml
route:
  group_interval: 10s  # Увеличить до 30s или 1m
```

---

## Best Practices

### 1. Используйте группы для команд

Создайте отдельные группы:
- `Yoldosh Alerts - Critical` - только critical
- `Yoldosh Alerts - All` - все алерты
- `Yoldosh Alerts - Business` - только бизнес-метрики

### 2. Настройте роутинг

В [alertmanager.yml](alertmanager.yml):
```yaml
routes:
  - match:
      severity: critical
    receiver: 'telegram-critical'
  
  - match:
      severity: warning
    receiver: 'telegram-warning'
  
  - match:
      component: business
    receiver: 'telegram-business'
```

### 3. Используйте silence для плановых работ

Перед обновлением/релизом:
```
/silence APIDown 1h
/silence HighLatencyP99 1h
```

### 4. Добавьте ссылки на runbooks

В alert rules добавьте аннотацию:
```yaml
annotations:
  summary: "High error rate"
  description: "Error rate is {{ $value }}%"
  runbook_url: "https://wiki.yoldosh.com/runbooks/high-error-rate"
```

### 5. Мониторинг самого мониторинга

Создайте алерт для Telegram бота:
```yaml
- alert: TelegramBotDown
  expr: up{job="alertmanager-bot"} == 0
  for: 2m
  labels:
    severity: critical
    component: monitoring
  annotations:
    summary: "Telegram bot is down"
    description: "Alerts won't be delivered to Telegram"
```

---

## Альтернативы

Если `alertmanager-bot` не подходит, можно использовать:

### 1. Webhook + Custom Service

Создать свой сервис на Node.js/Python, который:
1. Принимает webhook от Alertmanager
2. Форматирует сообщение
3. Отправляет через Telegram Bot API

### 2. Telegram API напрямую

В [alertmanager.yml](alertmanager.yml):
```yaml
receivers:
  - name: 'telegram'
    webhook_configs:
      - url: 'https://api.telegram.org/bot<TOKEN>/sendMessage'
        send_resolved: true
        http_config:
          basic_auth:
            username: ''
            password: ''
```

Но это требует больше настроек и не поддерживает команды бота.

---

## Ссылки

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Alertmanager Bot GitHub](https://github.com/metalmatze/alertmanager-bot)
- [Alertmanager Configuration](https://prometheus.io/docs/alerting/latest/configuration/)
- [Go Template Syntax](https://pkg.go.dev/text/template)

---

## Итоговая инструкция (TL;DR)

```bash
# 1. Создать бота через @BotFather → получить TOKEN
# 2. Получить свой ID через @userinfobot → получить ADMIN_ID
# 3. Добавить в .env:
#    TELEGRAM_BOT_TOKEN=...
#    TELEGRAM_ADMIN_ID=...
# 4. Запустить:
docker compose up -d

# 5. Открыть бота в Telegram → /start → /subscribe
# 6. Готово! 🎉
```
