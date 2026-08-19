import { z } from 'zod';
import { BookingType, GarageStatus } from '../Trip';
import { getCurrentTimeUTC } from '../../../../shared/utils/timeUtils';

export const createTripSchema = z.object({
   car_id: z.uuid({ message: 'Invalid car ID format (UUID expected).' }),

   from_latitude: z.coerce.number("'From' latitude must be a number."),
   from_longitude: z.coerce.number("'From' longitude must be a number."),

   to_latitude: z.coerce.number("'To' latitude must be a number."),
   to_longitude: z.coerce.number("'To' longitude must be a number."),

   distance: z.coerce
      .number("'Distance location must be a number.")
      .positive({ message: 'distance must be a positive number.' })
      .optional(),
   duration: z.coerce
      .number('Duration must be a number.')
      .positive({ message: 'duration must be a positive number.' })
      .optional(),

   departure_ts: z.iso
      .datetime({
         message:
            'Invalid date format. Expected ISO string (yyyy-MM-ddTHH:mm:ssZ).',
      })
      .pipe(z.coerce.date())
      .refine((date) => date > getCurrentTimeUTC(), {
         message: 'Departure date must be in the future.',
      }),

   seats_available: z.coerce
      .number()
      .int({ message: 'Seats must be an integer.' })
      .positive({ message: 'Seats must be a positive number.' })
      .min(1, { message: 'At least 1 seat must be available.' })
      .default(1),

   price_per_person: z.coerce
      .number()
      .positive({ message: 'Price must be a positive number.' }),

   max_two_back: z.boolean().default(false),

   conditioner: z.boolean().default(false).optional(),
   smoking_allowed: z.boolean().default(false).optional(),
   door_pickup: z.boolean().default(false).optional(),
   food_stop: z.boolean().default(false).optional(),
   garage: z
      .enum([GarageStatus.Empty, GarageStatus.HalfEmpty, GarageStatus.Full])
      .optional(),

   parcels_allowed: z.boolean().default(false).optional(),
   parcel_price: z.coerce
      .number()
      .positive({ message: 'Parcel price must be a positive number.' })
      .optional()
      .nullable(),

   comment: z
      .string()
      .max(255, 'Comment must not exceed 255 characters.')
      .optional()
      .nullable(),
   booking_type: z
      .enum([BookingType.instant, BookingType.request])
      .default(BookingType.instant)
      .optional(),
});

export type createTripDto = z.infer<typeof createTripSchema>;
