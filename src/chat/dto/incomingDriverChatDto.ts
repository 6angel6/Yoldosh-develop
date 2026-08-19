import { z } from 'zod';

export const incomingDriverChatSchema = z.object({
   driver_phone: z
      .string()
      .regex(/^\+998\d{9}$/, 'driver_phone must be in +998XXXXXXXXX format'),
   message: z.string().min(1).max(4096),
   tg_message_id: z.number().int().nonnegative(),
   tg_user_id: z.number().int().nonnegative(),
   sender_session: z.string().min(1).max(64),
   received_at: z
      .string()
      .min(1)
      .max(64)
      .regex(
         /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/,
         'received_at must be ISO-8601 in UZ local time without tz suffix (e.g. 2026-05-19T14:32:11)',
      ),
});

export type IncomingDriverChatDto = z.infer<typeof incomingDriverChatSchema>;
