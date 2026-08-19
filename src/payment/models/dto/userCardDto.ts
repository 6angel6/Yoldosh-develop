import { z } from 'zod';

/**
 * Тело DELETE /card/deleteCard. В Express 5 `req.body` бывает `undefined`
 * (запрос без JSON Content-Type) — чтение поля напрямую давало TypeError
 * и 500. Текст сообщения совпадает с прежней ручной проверкой.
 */
export const deleteCardSchema = z.object({
   userCardId: z.uuid({ message: 'UserCardId field is required' }),
});

export type DeleteCardDto = z.infer<typeof deleteCardSchema>;
