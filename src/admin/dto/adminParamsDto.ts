import { z } from 'zod';

/**
 * Path-параметры админских роутов. Без проверки строка вроде 'abc' доезжает до
 * Postgres, падает на типе колонки и возвращается клиенту как 500 вместо 400.
 */
const uuid = (entity: string) =>
   z.uuid({ message: `Invalid ${entity} ID format (UUID expected).` });

export const applicationIdParamsSchema = z.object({
   applicationId: uuid('application'),
});

export const adminIdParamsSchema = z.object({ adminId: uuid('admin') });

export const adminUserIdParamsSchema = z.object({ userId: uuid('user') });

export const adminTripIdParamsSchema = z.object({ tripId: uuid('trip') });

export const adminBookingIdParamsSchema = z.object({
   bookingId: uuid('booking'),
});

export const reportIdParamsSchema = z.object({ reportId: uuid('report') });

/** Blog и Banner используют общий `:id`. */
export const adminIdOnlyParamsSchema = z.object({ id: uuid('resource') });

/**
 * Исключение: `restricted_words.id` объявлен INTEGER, а не UUID.
 * Значение остаётся строкой — сервис принимает её как есть, меняется только
 * то, что нечисловой ввод отсекается на границе.
 */
export const wordIdParamsSchema = z.object({
   wordId: z
      .string()
      .regex(/^\d+$/, { message: 'Invalid word ID (integer expected).' }),
});
