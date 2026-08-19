import { z } from 'zod';

export const createReportSchema = z.object({
   reason: z
      .string('Reason is required.')
      .min(10, 'Report reason must be at least 10 characters long.')
      .max(500, 'Report reason must be 500 characters or less.'),
});

export type CreateReportDto = z.infer<typeof createReportSchema>;

/** `:userId` в пути жалобы на пользователя. */
export const userIdParamsSchema = z.object({
   userId: z.uuid({ message: 'Invalid user ID format (UUID expected).' }),
});
