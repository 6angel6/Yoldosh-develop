import { z } from 'zod';
import { BookingType, GarageStatus } from '../Trip';
import { getCurrentTimeUTC } from '../../../../shared/utils/timeUtils';

export const updateTripSchema = z.object({
   from_latitude: z.coerce.number().optional(),
   from_longitude: z.coerce.number().optional(),
   to_latitude: z.coerce.number().optional(),
   to_longitude: z.coerce.number().optional(),

   distance: z.coerce
      .number("'Distance location must be a number.")
      .positive({ message: 'distance must be a positive number.' })
      .optional(),
   duration: z.coerce
      .number('Duration must be a number.')
      .positive({ message: 'duration must be a positive number.' })
      .optional(),
   booking_type: z
      .enum([BookingType.instant, BookingType.request])
      .default(BookingType.instant)
      .optional(),

   departure_ts: z.iso
      .datetime({
         message:
            'Invalid date format. Expected ISO string (yyyy-MM-ddTHH:mm:ssZ).',
      })
      .pipe(z.coerce.date())
      .refine((date) => date > getCurrentTimeUTC(), {
         message: 'Departure date must be in the future.',
      })
      .optional(),
   seats_available: z.coerce
      .number()
      .int({ message: 'Seats must be an integer.' })
      .min(1, { message: 'Seats available cannot be negative.' })
      .optional(),
   price_per_person: z.coerce
      .number()
      .positive({ message: 'Price must be a positive number.' })
      .optional(),
   max_two_back: z.boolean().optional(),
   conditioner: z.boolean().optional(),
   smoking_allowed: z.boolean().optional(),
   door_pickup: z.boolean().optional(),
   food_stop: z.boolean().optional(),
   garage: z
      .enum([GarageStatus.Empty, GarageStatus.HalfEmpty, GarageStatus.Full])
      .optional(),
   parcels_allowed: z.boolean().optional(),
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
});

export type updateTripDto = z.infer<typeof updateTripSchema>;
