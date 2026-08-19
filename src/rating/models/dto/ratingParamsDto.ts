import { z } from 'zod';

/** `:userId` в пути выдачи оценок пользователя. */
export const ratingUserIdParamsSchema = z.object({
   userId: z.uuid({ message: 'Invalid user ID format (UUID expected).' }),
});
