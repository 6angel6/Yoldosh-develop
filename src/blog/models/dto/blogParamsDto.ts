import { z } from 'zod';

/** `:slug` в пути публичной статьи. Это не uuid, а человекочитаемый ключ. */
export const blogSlugParamsSchema = z.object({
   slug: z
      .string()
      .min(1, { message: 'Slug is required.' })
      .max(200, { message: 'Slug is too long.' })
      .regex(/^[a-z0-9-]+$/i, { message: 'Slug has invalid characters.' }),
});
