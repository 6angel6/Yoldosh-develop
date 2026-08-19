# 🏗️ Observability Stack Architecture

## 📊 High-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                             │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Yoldosh Node.js Monolith (Express + TypeScript)          │   │
│  │                                                             │   │
│  │  • prom-client instrumentation (:9100/metrics)             │   │
│  │  • Pino structured JSON logging                            │   │
│  │  • Business metrics middleware                             │   │
│  │  • Request correlation IDs (requestId, traceId, userId)    │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                           │
                           │ Metrics (10s scrape)
                           │ Logs (JSON via Docker)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    COLLECTION LAYER                               │
│  ┌─────────────────────┐         ┌─────────────────────┐        │
│  │   Prometheus        │         │      Promtail        │        │
│  │   (scraper)         │         │   (log shipper)      │        │
│  │                     │         │                      │        │
│  │  • Job: yoldosh-app │         │  • Docker SD         │        │
│  │  • Job: postgres    │         │  • JSON parsing      │        │
│  │  • Job: redis       │         │  • Label extraction  │        │
│  │  • Recording rules  │         │  • Multi-label index │        │
│  └─────────────────────┘         └─────────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
                           │
                           │ Query & Alert
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                   PROCESSING LAYER                                │
│  ┌─────────────────────┐         ┌─────────────────────┐        │
│  │  Alertmanager       │         │       Loki          │        │
│  │  (alert routing)    │         │   (log storage)     │        │
│  │                     │         │                      │        │
│  │  • Critical alerts  │         │  • 7d retention     │        │
│  │  • Warning alerts   │         │  • Compaction       │        │
│  │  • Business alerts  │         │  • Query engine     │        │
│  │  • Telegram bot     │         │  • Label indexing   │        │
│  └─────────────────────┘         └─────────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
                           │
                           │ Dashboards & Queries
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                  VISUALIZATION LAYER                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                       Grafana                              │   │
│  │                                                            │   │
│  │  Datasources:                                             │   │
│  │    • Prometheus (metrics)                                 │   │
│  │    • Loki (logs)                                          │   │
│  │                                                            │   │
│  │  Dashboards:                                              │   │
│  │    01 - Business & API Metrics                            │   │
│  │    02 - PostgreSQL Metrics                                │   │
│  │    03 - System Resources                                  │   │
│  │    04 - Logs Analysis                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### 1. Metrics Pipeline

```
App (:9100/metrics)
  │
  ├─> http_requests_total{method, endpoint, status}
  ├─> http_request_duration_seconds{...} [histogram]
  ├─> trip_search_total{status}
  ├─> booking_created_total
  └─> yoldosh_process_*
       │
       ▼
Prometheus (scrape every 10s)
  │
  ├─> Recording Rules (pre-aggregation)
  │    ├─> api:http_requests:rate5m
  │    ├─> business:booking_conversion_rate
  │    └─> db:cache_hit_ratio
  │
  ├─> Alert Rules (evaluation every 30s)
  │    ├─> Critical: AppDown, HighLatency, OutOfMemory
  │    ├─> Warning: HighMemory, EventLoopLag
  │    └─> Business: LowConversionRate, LowBookingRate
  │         │
  │         ▼
  │    Alertmanager
  │         │
  │         ├─> Route by severity
  │         └─> Notify via Telegram Bot
  │
  └─> Storage (7d, 3GB limit)
       │
       ▼
Grafana Queries
  │
  └─> Dashboard Panels (auto-refresh 10-30s)
```

### 2. Logs Pipeline

```
App (Pino JSON Logger)
  │
  └─> {
       level: "info",
       time: "2026-01-21T...",
       req: { method, url },
       res: { statusCode },
       responseTime: 42,
       userId: "123",
       requestId: "abc-def",
       traceId: "xyz-123",
       msg: "Request completed"
      }
       │
       ▼
Docker Logs (stdout/stderr)
       │
       ▼
Promtail (Docker Service Discovery)
  │
  ├─> JSON Parser
  │    ├─> Extract: level, method, status
  │    ├─> Extract: requestId, traceId, userId
  │    └─> Add labels: {job, container, environment}
  │
  └─> Batch Send
       │
       ▼
Loki (Log Storage)
  │
  ├─> Index by labels
  ├─> Store chunks (7d retention)
  ├─> Compaction (every 10min)
  │
  └─> Query API
       │
       ▼
Grafana Explore & Logs Dashboard
  │
  └─> LogQL queries:
       • {job="yoldosh-app", level="error"}
       • {job="yoldosh-app"} |= "booking" | json
       • count_over_time({job="yoldosh-app"}[5m])
```

---

## 📦 Components Breakdown

### Application Instrumentation

**Файлы:**
- `src/monitoring/service/metricService.ts` - prom-client metrics
- `src/monitoring/middleware/businessMetrics.ts` - business tracking
- `shared/utils/logger.ts` - Pino structured logging
- `src/main.ts` - integration point

**Метрики:**
```typescript
// HTTP Metrics
http_requests_total
http_request_duration_seconds (histogram)
http_response_size_bytes (histogram)

// Business Metrics
trip_search_total
trip_created_total
booking_created_total
user_registration_total
business:booking_conversion_rate (recording rule)

// System Metrics (auto-collected)
yoldosh_process_cpu_seconds_total
yoldosh_process_resident_memory_bytes
yoldosh_nodejs_eventloop_lag_seconds
yoldosh_nodejs_heap_*
yoldosh_nodejs_gc_*
```

### Prometheus

**Конфигурация:**
- `monitoring/prometheus/prometheus.yml` - main config
- `monitoring/prometheus/rules/recording-rules.yml` - pre-aggregation
- `monitoring/prometheus/alerts/*.yml` - alert rules

**Optimization:**
- Scrape intervals: 10-30s (instead of 5s)
- Histogram buckets optimized for SLA
- Recording rules for expensive queries
- Storage: 7d retention, 3GB limit
- Resource limits: 0.5 CPU, 512MB RAM

### Loki + Promtail

**Конфигурация:**
- `monitoring/loki/loki-config.yml` - storage & limits
- `monitoring/promtail/promtail-config.yml` - log collection

**Features:**
- Docker Service Discovery
- JSON log parsing
- Multi-label indexing
- Batch sending
- Compaction every 10min
- 7d retention
- Resource limits: 0.4 CPU, 400MB RAM (Loki) + 0.2 CPU, 128MB (Promtail)

### Grafana

**Конфигурация:**
- `monitoring/grafana/config.ini` - main settings
- `monitoring/grafana/provisioning/datasources/all.yml` - auto datasources
- `monitoring/grafana/provisioning/dashboards/all.yml` - dashboard loading
- `monitoring/grafana/dashboards/*.json` - dashboard definitions

**Optimization:**
- SQLite (not PostgreSQL) for low overhead
- Telemetry disabled
- Log level: warn
- Resource limits: 0.5 CPU, 256MB RAM

### Alertmanager

**Конфигурация:**
- `monitoring/alertmanager/alertmanager.yml` - routing & receivers
- `monitoring/alertmanager/telegram-template.tmpl` - message formatting

**Alert Routing:**
```yaml
critical → Telegram (immediate)
warning → Telegram (grouped, 3h repeat)
info → Telegram (grouped, 24h repeat)
business → Telegram (custom)
```

---

## 🎯 Metrics Strategy

### 1. RED Method (Requests, Errors, Duration)

**Requests:** `sum(rate(http_requests_total[5m]))`
**Errors:** `sum(rate(http_requests_total{status=~"5.."}[5m]))`
**Duration:** `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`

### 2. USE Method (Utilization, Saturation, Errors)

**Utilization:** `rate(yoldosh_process_cpu_seconds_total[5m]) * 100`
**Saturation:** `yoldosh_nodejs_eventloop_lag_seconds`
**Errors:** `yoldosh_nodejs_gc_duration_seconds > threshold`

### 3. Business Metrics (Custom)

**Conversion Funnel:**
```
Searches → Trips Created → Bookings → Payments
   ↓           ↓              ↓           ↓
100%        10%            30%         95%
```

**Key Metrics:**
- Conversion Rate = Bookings / Searches
- Error Rate per Operation = Errors / Total
- Active Users (24h window)
- Revenue metrics (if applicable)

---

## 🔒 Security Considerations

### 1. Credentials Management
- Grafana admin password in `.env`
- Telegram bot token in `.env`
- No hardcoded secrets

### 2. Network Isolation
- All monitoring services in `yoldosh-net` network
- Prometheus scrapes internal endpoints only
- Grafana accessible externally (consider nginx auth)

### 3. Data Retention
- Metrics: 7 days (GDPR compliant)
- Logs: 7 days (no PII in logs)
- No persistent user data in monitoring

### 4. Log Sanitization
```typescript
// Don't log:
logger.info({ password: req.body.password }); // ❌

// Do log:
logger.info({ userId: req.user.id }); // ✅
logger.info({ email: sanitize(req.body.email) }); // ✅
```

---

## 📈 Scaling Considerations

### Vertical Scaling (MVP → Production)

**Current (MVP):**
- Prometheus: 512MB RAM, 7d retention
- Loki: 400MB RAM, 7d retention
- Grafana: 256MB RAM

**Production (High Load):**
- Prometheus: 2-4GB RAM, 30d retention, consider Thanos
- Loki: 2GB RAM, 30d retention, S3 backend
- Grafana: 512MB-1GB RAM, PostgreSQL backend

### Horizontal Scaling

**Prometheus:**
- Federation (multiple Prometheus instances)
- Thanos for long-term storage
- Remote write to VictoriaMetrics

**Loki:**
- Distributed mode (ingester, querier, compactor)
- S3/GCS for chunks storage
- Memcached for caching

**Grafana:**
- Multiple instances behind load balancer
- Shared PostgreSQL for dashboards
- Redis for sessions

---

## 🎓 Next Steps

### For MVP:
1. ✅ Deploy as-is with `docker compose up`
2. ✅ Configure Telegram alerts (optional)
3. ✅ Set Grafana password
4. Monitor for 1-2 weeks
5. Adjust alert thresholds based on actual load

### For Production:
1. Add Nginx auth for Grafana
2. Enable HTTPS for all endpoints
3. Set up Thanos for long-term metrics
4. Configure Loki S3 backend
5. Add distributed tracing (Tempo/Jaeger)
6. Set up SLOs and SLIs
7. Implement on-call rotation

---

**Architecture Version:** 1.0.0  
**Last Updated:** 2026-01-21  
**Maintainer:** Yoldosh DevOps Team
