'use strict';

/**
 * Второй проход бэкфилла: name-based матчинг через cities.aliases.
 *
 * Зачем: у некоторых трипов координаты кривые (Яндекс вернул центр области
 * вместо города), ST_Covers и nearest-в-50км не сработали. Но строка
 * trips.from_city / to_city уже содержит правильное имя города (его подставил
 * Python-парсер до геокодера). Матчим по имени — это точнее, чем расширять
 * радиус и рисковать назначить СОСЕДНИЙ город.
 *
 * Нормализация строки: lower + убрать апострофы (такая же как в aliases).
 * Ищем точное вхождение в aliases (GIN-индекс) или префиксное.
 */
module.exports = {
   async up(queryInterface) {
      // Нормализация: lower + удалить апострофы типа ' ʻ ʼ ` ´
      // Та же логика, что в seeder buildAliases
      const normalizeExpr = (col) => `
         regexp_replace(lower(trim(${col})), '[''ʻʼ\`´]', '', 'g')
      `;

      const nameMatchSql = (nameCol, idField) => `
         UPDATE trips t
            SET ${idField} = sub.city_id
           FROM (
              SELECT DISTINCT ON (tt.id) tt.id AS trip_id, c.id AS city_id
                FROM trips tt
                JOIN cities c
                  ON c.is_active = true
                 AND ${normalizeExpr(`tt.${nameCol}`)} = ANY(c.aliases)
               WHERE tt.${idField} IS NULL
                 AND tt.${nameCol} IS NOT NULL
                 AND tt.${nameCol} <> ''
                 AND tt.deleted_at IS NULL
                 AND tt.status IN ('CREATED', 'IN_PROGRESS')
               ORDER BY tt.id,
                        -- Если имя матчится и у города admin_level=6, и у области
                        -- admin_level=4 — берём более конкретный (6 = сам город/туман)
                        c.admin_level DESC,
                        COALESCE(c.population, 0) DESC
           ) sub
          WHERE t.id = sub.trip_id;
      `;

      await queryInterface.sequelize.query(nameMatchSql('from_city', 'from_city_id'));
      await queryInterface.sequelize.query(nameMatchSql('to_city', 'to_city_id'));

      const [[stats]] = await queryInterface.sequelize.query(`
         SELECT
            COUNT(*)                                     AS total_active,
            COUNT(from_city_id)                          AS with_from,
            COUNT(to_city_id)                            AS with_to,
            COUNT(*) FILTER (WHERE from_city_id IS NULL) AS missing_from,
            COUNT(*) FILTER (WHERE to_city_id   IS NULL) AS missing_to
           FROM trips
          WHERE deleted_at IS NULL
            AND status IN ('CREATED', 'IN_PROGRESS');
      `);

      console.log('✅ Name-based backfill done:', stats);

      // Показать топ не смэтченных имён — чтобы подкрутить aliases если надо
      const [unmatched] = await queryInterface.sequelize.query(`
         SELECT from_city, COUNT(*) AS cnt
           FROM trips
          WHERE from_city_id IS NULL
            AND deleted_at IS NULL
            AND status = 'CREATED'
            AND from_city IS NOT NULL
            AND from_city <> ''
          GROUP BY from_city
          ORDER BY cnt DESC
          LIMIT 20;
      `);
      if (unmatched.length > 0) {
         console.log('⚠️  Top unmatched from_city names (add to aliases if legit):');
         unmatched.forEach((r) =>
            console.log(`   "${r.from_city}" — ${r.cnt} trips`),
         );
      }
   },

   async down() {
      console.log('ℹ️ No rollback needed — backfill only UPDATEs, not DDL');
   },
};
