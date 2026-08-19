#!/bin/bash
set -e

# Ждем пока мастер станет доступен (простая проверка порта)
until pg_isready -h db -p 5432 -U "$DB_REPL_USER"; do
  echo "Waiting for primary database..."
  sleep 2
done

if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "Data folder is empty. Cloning data from primary..."
    export PGPASSWORD=$DB_REPL_PASSWORD

    pg_basebackup -h db -p 5432 -U "$DB_REPL_USER" -D "$PGDATA" -Fp -Xs -P -R

    echo "Cloning finished."

    # Фикс прав доступа, так как pg_basebackup может записать их от root
    chmod 700 "$PGDATA"
fi

exec docker-entrypoint.sh postgres