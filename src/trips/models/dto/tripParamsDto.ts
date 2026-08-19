import { z } from 'zod';

/**
 * `:tripId` в пути. Без проверки строка вроде 'abc' доезжает до Postgres,
 * падает на типе uuid и возвращается клиенту как 500 вместо 400.
 */
export const tripIdParamsSchema = z.object({
   tripId: z.uuid({ message: 'Invalid trip ID format (UUID expected).' }),
});
