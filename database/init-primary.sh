#!/bin/bash
set -e

# Создаем пользователя для репликации
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER $DB_REPL_USER WITH REPLICATION ENCRYPTED PASSWORD '$DB_REPL_PASSWORD';
EOSQL

# Добавляем разрешение в pg_hba.conf
# scram-sha-256 — дефолт PostgreSQL 14+, md5 не работает с новым хешем паролей
echo "host replication $DB_REPL_USER 0.0.0.0/0 scram-sha-256" >> "$PGDATA/pg_hba.conf"

# Для применения настроек pg_hba.conf требуется перезагрузка,
# но так как это init-скрипт, Postgres и так перезапустится после его завершения.
