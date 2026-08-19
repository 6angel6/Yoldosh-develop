'use strict';

/**
 * Backfill from_city_id/to_city_id для существующих поездок.
 *
 * Работает только на активных и будущих поездках — прошедшие/завершённые
 * в поиск всё равно не попадают, их трогать смысла нет.
 *
 * Логика та же, что в CityResolver:
 *   1) ST_Covers(cities.bbox_geo, trips.from_geo) — точное попадание в полигон;
 *      при конфликте берём более конкретный уровень (admin_level DESC).
 *   2) Если точка вне всех полигонов — ближайший центр в 50 км.
 */
module.exports = {
   async up(queryInterface) {
      // ---- Волна 1: bbox match (большинство поездок) ----
      const bboxSql = (field, idField) => `
         UPDATE trips t
            SET ${idField} = sub.city_id
           FROM (
              SELECT DISTINCT ON (tt.id) tt.id AS trip_id, c.id AS city_id
                FROM trips tt
                JOIN cities c
                  ON c.is_active = true
                 AND c.bbox_geo IS NOT NULL
                 AND ST_Covers(c.bbox_geo, tt.${field})
               WHERE tt.${idField} IS NULL
                 AND tt.${field} IS NOT NULL
                 AND tt.deleted_at IS NULL
                 AND (tt.status IN ('CREATED', 'IN_PROGRESS')
                      OR tt.departure_ts > now() - interval '30 days')
               ORDER BY tt.id, c.admin_level DESC
           ) sub
          WHERE t.id = sub.trip_id;
      `;

      const [fromBbox] = await queryInterface.sequelize.query(bboxSql('from_geo', 'from_city_id'));
      const [toBbox] = await queryInterface.sequelize.query(bboxSql('to_geo', 'to_city_id'));

      // ---- Волна 2: nearest center fallback (для точек вне полигонов) ----
      const nearestSql = (field, idField) => `
         UPDATE trips t
            SET ${idField} = sub.city_id
           FROM (
              SELECT DISTINCT ON (tt.id) tt.id AS trip_id, c.id AS city_id
                FROM trips tt
                JOIN cities c
                  ON c.is_active = true
                 AND ST_DWithin(c.center_geo, tt.${field}, 50000)
               WHERE tt.${idField} IS NULL
                 AND tt.${field} IS NOT NULL
                 AND tt.deleted_at IS NULL
                 AND (tt.status IN ('CREATED', 'IN_PROGRESS')
                      OR tt.departure_ts > now() - interval '30 days')
               ORDER BY tt.id, c.admin_level DESC,
                        ST_Distance(c.center_geo, tt.${field}) ASC
           ) sub
          WHERE t.id = sub.trip_id;
      `;

      await queryInterface.sequelize.query(nearestSql('from_geo', 'from_city_id'));
      await queryInterface.sequelize.query(nearestSql('to_geo', 'to_city_id'));

      // Диагностика — сколько осталось без города
      const [[stats]] = await queryInterface.sequelize.query(`
         SELECT
            COUNT(*)                                       AS total,
            COUNT(from_city_id)                            AS with_from,
            COUNT(to_city_id)                              AS with_to,
            COUNT(*) FILTER (WHERE from_city_id IS NULL)   AS missing_from,
            COUNT(*) FILTER (WHERE to_city_id   IS NULL)   AS missing_to
           FROM trips
          WHERE deleted_at IS NULL
            AND (status IN ('CREATED', 'IN_PROGRESS')
                 OR departure_ts > now() - interval '30 days');
      `);

      console.log('✅ Backfill city_ids done:', stats);
   },

   async down(queryInterface) {
      await queryInterface.sequelize.query(`
         UPDATE trips SET from_city_id = NULL, to_city_id = NULL;
      `);
      console.log('✅ Rollback: trip city_ids cleared');
   },
};
