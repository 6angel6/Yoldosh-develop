import { z } from 'zod';

// Максимально просто: только трип и две точки — где забрать (А) и куда
// привезти (Б). Никаких данных о самой посылке (как в Яндекс Доставке).
export const createParcelSchema = z.object({
   tripId: z.uuid({ message: 'Invalid trip ID format (UUID expected).' }),

   pickup_latitude: z.coerce.number("'Pickup' latitude must be a number."),
   pickup_longitude: z.coerce.number("'Pickup' longitude must be a number."),

   dropoff_latitude: z.coerce.number("'Dropoff' latitude must be a number."),
   dropoff_longitude: z.coerce.number("'Dropoff' longitude must be a number."),
});

export type createParcelDto = z.infer<typeof createParcelSchema>;

export const parcelIdParamsSchema = z.object({
   parcelId: z.uuid({ message: 'Invalid parcel ID format (UUID expected).' }),
});

export const parcelTripParamsSchema = z.object({
   tripId: z.uuid({ message: 'Invalid trip ID format (UUID expected).' }),
});

export const cancelParcelSchema = z.object({
   cancellationReason: z
      .string()
      .min(1, { message: 'Cancellation reason is required.' })
      .max(100, 'Cancellation reason must not exceed 100 characters.'),
});
