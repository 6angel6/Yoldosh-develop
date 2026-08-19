import { z } from 'zod';

/** `:chatId` в пути. */
export const chatIdParamsSchema = z.object({
   chatId: z.uuid({ message: 'Invalid chat ID format (UUID expected).' }),
});

/** `:notificationId` в пути. */
export const notificationIdParamsSchema = z.object({
   notificationId: z.uuid({
      message: 'Invalid notification ID format (UUID expected).',
   }),
});
