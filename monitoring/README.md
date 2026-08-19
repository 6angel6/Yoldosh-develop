# 🔍 Production-Ready Observability Stack для Yoldosh MVP

## 📋 Содержание

- [Обзор](#-обзор)
- [Архитектура](#️-архитектура)
- [Быстрый старт](#-быстрый-старт)
- [Компоненты системы](#-компоненты-системы)
- [Дашборды Grafana](#-дашборды-grafana)
- [Алерты](#-алерты)
- [Оптимизация ресурсов](#-оптимизация-ресурсов)
- [Troubleshooting](#-troubleshooting)
- [Расширение системы](#-расширение-системы)

---

## 🎯 Обзор

Production-ready observability stack для монолитного Node.js сервиса (MVP аналог BlaBlaCar) с полным мониторингом метрик, логов и алертингом.

**Что включено из коробки:**
- ✅ Prometheus метрики (API, бизнес-метрики, PostgreSQL, Redis)
- ✅ Grafana дашборды (Business API, PostgreSQL, System, Logs)
- ✅ Structured JSON логирование с Loki + Promtail
- ✅ Alertmanager с Telegram интеграцией
- ✅ Оптимизация под MVP (минимальное потребление ресурсов)
- ✅ Correlation IDs для трейсинга запросов
- ✅ Business metrics (поиск, поездки, бронирования, conversion)

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Yoldosh Node.js App                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ prom-client  │  │ Pino Logger  │  │  Business    │      │
│  │  Metrics     │  │  JSON Logs   │  │  Metrics     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          │ :9100/metrics    │ Docker logs      │ Custom counters
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Prometheus    │  │    Promtail     │  │ Business Logic  │
│  (scrape 10s)   │  │ (log collector) │  │   Middleware    │
└────────┬────────┘  └────────┬────────┘  └─────────────────┘
         │                    │
         │ Recording rules    │ JSON parsing
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│   Alertmanager  │  │      Loki       │
│  (Telegram Bot) │  │  (log storage)  │
└─────────────────┘  └────────┬────────┘
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
         ▼                                         ▼
┌─────────────────────────────────────────────────────────────┐
│                        Grafana                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ Business API │ │  PostgreSQL  │ │   System     │       │
│  │  Dashboard   │ │   Dashboard  │ │  Resources   │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│  ┌──────────────┐                                          │
│  │ Logs Analysis│                                          │
│  │  Dashboard   │                                          │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Быстрый старт

### 1. Предварительные требования

```bash
# Убедитесь что установлены:
- Docker & Docker Compose
- Node.js 18+
- PostgreSQL 17
- Redis
```

### 2. Настройка переменных окружения

Добавьте в `.env`:

```bash
# Grafana
GRAFANA_USER=admin
GRAFANA_PASSWORD=your_secure_password_here

# Telegram Alerting (опционально)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ADMIN_ID=your_telegram_id_here
```

### 3. Запуск всего стека

```bash
# Запуск всех сервисов (включая monitoring)
docker compose up -d

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f prometheus grafana loki
```

### 4. Доступ к интерфейсам

| Сервис | URL | Credentials |
|--------|-----|-------------|
| **Grafana** | http://localhost:3000 | admin / `GRAFANA_PASSWORD` |
| **Prometheus** | http://localhost:9090 | - |
| **Alertmanager** | http://localhost:9093 | - |
| **Loki** | http://localhost:3100/ready | - |
| **App Metrics** | http://localhost:9100/metrics | - |

### 5. Первая проверка

```bash
# Проверить что метрики собираются
curl http://localhost:9100/metrics | grep http_requests_total

# Проверить Prometheus targets
curl http://localhost:9090/api/v1/targets

# Проверить Grafana datasources
curl -u admin:$GRAFANA_PASSWORD http://localhost:3000/api/datasources
```

---

## 🔧 Компоненты системы

### 1. Prometheus (метрики)

**Конфигурация:** `monitoring/prometheus/prometheus.yml`

**Основные метрики:**

| Метрика | Описание | Labels |
|---------|----------|--------|
| `http_requests_total` | Общее количество HTTP запросов | method, endpoint, status |
| `http_request_duration_seconds` | Latency гистограмма | method, endpoint, status |
| `trip_search_total` | Поиски поездок | status |
| `trip_created_total` | Созданные поездки | - |
| `booking_created_total` | Созданные бронирования | - |
| `user_registration_total` | Регистрации пользователей | status |
| `pg_stat_activity_count` | Активные PostgreSQL сессии | state |
| `redis_connected_clients` | Подключенные Redis клиенты | - |

### 2. Grafana (визуализация)

**4 готовых дашборда:**

#### 📊 01 - Business & API Metrics
- RPS (requests per second) по endpoint'ам
- Latency p50/p95/p99
- Error rate (5xx)
- Status code distribution
- Business operations: searches, trips, bookings
- Conversion rate (booking/search)

#### 🗄️ 02 - PostgreSQL Metrics
- Active connections
- Cache hit ratio (должен быть >95%)
- TPS (transactions per second)
- Deadlocks & locks
- Replication lag
- Database sizes

#### 🖥️ 03 - System Resources
- CPU usage
- Memory (RSS, Heap)
- Event loop lag
- Active handles
- GC metrics

#### 📋 04 - Logs Analysis
- Log stream с фильтрацией
- Log level distribution
- HTTP status codes из логов
- Error logs only
- Business operations logs

### 3. Loki + Promtail (логи)

**Особенности:**
- Структурированные JSON логи
- Автоматический парсинг полей
- Multi-label indexing
- Retention: 7 дней

### 4. Alertmanager (алерты)

**Критичные алерты:**
- 🔴 App/DB/Redis down (1 min)
- 🔴 High 5xx error rate (>5%, 5 min)
- 🔴 Critical latency p99 (>5s)
- 🔴 Out of memory (<5%)
- 🔴 PostgreSQL cache hit ratio low (<85%)

**Предупреждения:**
- ⚠️ High latency p95 (>1.5s)
- ⚠️ Event loop lag high (>100ms)
- ⚠️ High memory usage
- ⚠️ PostgreSQL deadlocks

---

## ⚡ Оптимизация ресурсов

### Лимиты по контейнерам (оптимизировано для MVP):

| Сервис | CPU | Memory | Описание |
|--------|-----|--------|----------|
| **prometheus** | 0.5 | 512MB | Оптимизированные buckets |
| **grafana** | 0.5 | 256MB | SQLite, отключены обновления |
| **loki** | 0.4 | 400MB | Retention 7 дней |
| **promtail** | 0.2 | 128MB | Batch отправка |
| **alertmanager** | 0.2 | 128MB | Минимальные ресурсы |
| **postgres-exporter** | 0.2 | 128MB | Запросы каждые 15s |
| **redis-exporter** | 0.1 | 64MB | Легковесный |

**Итого:** ~2.1 CPU cores, ~1.6 GB RAM для всего monitoring stack

---

## 🔍 Troubleshooting

### Prometheus не видит targets

```bash
# Проверить connectivity
docker compose exec prometheus wget -O- http://yoldosh-service:9100/metrics

# Проверить конфиг
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Перезагрузить конфиг
curl -X POST http://localhost:9090/-/reload
```

### Grafana не показывает данные

```bash
# Проверить datasources
curl -u admin:password http://localhost:3000/api/datasources

# Проверить Prometheus
curl http://localhost:9090/api/v1/query?query=up

# Логи
docker compose logs grafana | tail -50
```

### Loki не получает логи

```bash
# Проверить Promtail
docker compose logs promtail | grep -i error

# Проверить Loki
curl http://localhost:3100/ready

# Тестовый лог
curl -H "Content-Type: application/json" -XPOST http://localhost:3100/loki/api/v1/push \
  --data '{"streams": [{"stream": {"job": "test"}, "values": [["'$(date +%s)000000000'", "test"]]}]}'
```

---

## 📚 Расширение системы

### Добавление новых метрик

```typescript
// src/monitoring/service/metricService.ts
export const myCounter = new client.Counter({
  name: 'my_metric_total',
  help: 'My custom metric',
  labelNames: ['label1'],
});

// Использование
myCounter.inc({ label1: 'value' });
```

### Добавление алерта

```yaml
# monitoring/prometheus/alerts/custom-alerts.yml
- alert: MyAlert
  expr: my_metric > 100
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "My alert fired"
```

---

## 📊 Best Practices

### Метрики
1. Используйте labels разумно (не более 5-7 уникальных значений)
2. Histogram buckets настройте под ваши SLA
3. Counter для накопительных значений, Gauge для текущего состояния

### Логи
1. Всегда структурированные (JSON)
2. Correlation IDs (requestId, traceId, userId)
3. Не логируйте пароли, tokens, PII

### Алерты
1. Symptom-based alerting (high latency, не high CPU)
2. Если алерт не actionable - удалите его
3. critical → immediate, warning → review daily

---

## 📖 Полезные PromQL запросы

```promql
# Top 10 slowest endpoints (p95)
topk(10, histogram_quantile(0.95, 
  sum by (le, endpoint) (rate(http_request_duration_seconds_bucket[5m]))
))

# Error rate по endpoint
sum by (endpoint) (rate(http_requests_total{status=~"5.."}[5m])) 
/ 
sum by (endpoint) (rate(http_requests_total[5m]))

# Memory leak detection
deriv(yoldosh_process_resident_memory_bytes[1h]) > 0
```

---

## ✅ Production Readiness Checklist

- [ ] Все сервисы запустились: `docker compose ps`
- [ ] Prometheus видит все targets: http://localhost:9090/targets
- [ ] Grafana показывает данные: http://localhost:3000
- [ ] Loki получает логи: проверьте дашборд "04 - Logs Analysis"
- [ ] Alerts настроены: http://localhost:9093
- [ ] Telegram bot работает (опционально)
- [ ] Resource limits применены
- [ ] Retention настроен (7 дней)

---

**Версия:** 1.0.0  
**Дата:** 2026-01-21  
**Автор:** Yoldosh DevOps Team

**🎉 Готово к production!**
