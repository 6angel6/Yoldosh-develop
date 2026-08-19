import { z } from 'zod';

export const createBookingSchema = z.object({
   tripId: z.uuid({ message: 'Invalid trip ID format (UUID expected).' }),

   pickup_latitude: z.coerce.number("'From' latitude must be a number."),
   pickup_longitude: z.coerce.number("'From' longitude must be a number."),

   dropoff_latitude: z.coerce.number("'To' latitude must be a number."),
   dropoff_longitude: z.coerce.number("'To' longitude must be a number."),

   seatsBooked: z.coerce
      .number()
      .int({ message: 'Seats must be an integer.' })
      .positive({ message: 'Seats must be a positive number.' })
      .min(1, { message: 'At least 1 seat must be booked.' }),
});

export type createBookDto = z.infer<typeof createBookingSchema>;

/**
 * `:bookingId` в пути. Без проверки строка вроде 'abc' доезжала до Postgres,
 * падала на типе uuid и возвращалась клиенту как 500.
 */
export const bookingIdParamsSchema = z.object({
   bookingId: z.uuid({ message: 'Invalid booking ID format (UUID expected).' }),
});

// Тексты сообщений совпадают с прежними ручными проверками в контроллере,
// чтобы форма ответа на невалидный вход не изменилась.
export const cancelBookingSchema = z.object({
   cancellationReason: z
      .string()
      .min(1, { message: 'Cancellation reason is required.' }),
});

export const updateBookingSchema = z.object({
   seatsBooked: z.coerce
      .number('Valid seatsBooked is required.')
      .int('Valid seatsBooked is required.')
      .positive('Valid seatsBooked is required.'),
});
