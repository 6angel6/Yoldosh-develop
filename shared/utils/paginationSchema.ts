import { z } from 'zod';

/**
 * Пагинация в query. Раньше страницы читались как
 * `parseInt(req.query.limit || '10', 10)`: `limit=abc` давал `NaN`, который
 * уходил в Sequelize и возвращался клиенту как 500, а `limit=999999` читал
 * таблицу целиком.
 *
 * BEHAVIOR CHANGE: `limit` больше 100 теперь отклоняется с 400. Единственное
 * место, где кодовая база уже ограничивала выборку, — `statisticsService`
 * (там потолок 200).
 */
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
   page: z.coerce
      .number('Page must be a number.')
      .int('Page must be an integer.')
      .min(1, 'Page must be at least 1.')
      .optional(),
   limit: z.coerce
      .number('Limit must be a number.')
      .int('Limit must be an integer.')
      .min(1, 'Limit must be at least 1.')
      .max(MAX_PAGE_SIZE, `Limit must be at most ${MAX_PAGE_SIZE}.`)
      .optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
