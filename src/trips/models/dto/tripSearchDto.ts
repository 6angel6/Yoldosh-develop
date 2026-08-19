import { z } from 'zod';
import { GarageStatus } from '../Trip';
import { getStartOfTodayUTC } from '../../../../shared/utils/timeUtils';

export const searchTripSchema = z
   .object({
      from_latitude: z.coerce.number("'From' latitude must be a number."),
      from_longitude: z.coerce.number("'From' longitude must be a number."),

      to_latitude: z.coerce.number("'To' latitude must be a number."),
      to_longitude: z.coerce.number("'To' longitude must be a number."),

      departure_date: z
         .string()
         .refine(
            (val) => {
               // Принимаем как ISO datetime (2026-02-02T00:00:00Z), так и просто дату (2026-02-02)
               const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
               const dateTimeRegex =
                  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
               return dateOnlyRegex.test(val) || dateTimeRegex.test(val);
            },
            {
               message:
                  'Invalid date format. Expected YYYY-MM-DD or ISO datetime.',
            },
         )
         .transform((val) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
               return new Date(`${val}T00:00:00Z`);
            }
            return new Date(val);
         })
         .refine(
            (date) => {
               const startOfTodayUTC = getStartOfTodayUTC();
               return date >= startOfTodayUTC;
            },
            {
               message: 'Дата отправления не может быть в прошлом.',
            },
         ),
      requested_seats: z.coerce.number().positive().default(1),

      sort_by_price: z.enum(['cheapest', 'expensive']).optional(),
      sort_by_time: z.enum(['earliest', 'latest']).optional(),

      conditioner: z
         .enum(['true', 'false'])
         .transform((val) => val === 'true')
         .optional(),

      smoking_allowed: z
         .enum(['true', 'false'])
         .transform((val) => val === 'true')
         .optional(),

      door_pickup: z
         .enum(['true', 'false'])
         .transform((val) => val === 'true')
         .optional(),

      food_stop: z
         .enum(['true', 'false'])
         .transform((val) => val === 'true')
         .optional(),
      garage: z.enum(GarageStatus).optional(),

      // Поиск трипов для отправки посылки: true → только трипы,
      // где водитель включил перевозку посылок
      parcels_allowed: z
         .enum(['true', 'false'])
         .transform((val) => val === 'true')
         .optional(),
   })
   .refine((data) => !(data.sort_by_price && data.sort_by_time), {
      message:
         'Вы можете выбрать только один тип сортировки: либо по цене, либо по времени',
      path: ['sort_by_price'],
   });

export type searchTripDto = z.infer<typeof searchTripSchema>;

export const searchTripPublicSchema = z.object({
   from_lat: z.coerce.number().optional(),
   from_lon: z.coerce.number().optional(),
   to_lat: z.coerce.number().optional(),
   to_lon: z.coerce.number().optional(),

   from: z.string().optional(),
   to: z.string().optional(),

   departure_date: z
      .string()
      .refine(
         (val) => {
            if (!val) return true; // optional
            const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
            const dateTimeRegex =
               /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
            return dateOnlyRegex.test(val) || dateTimeRegex.test(val);
         },
         {
            message:
               'Invalid date format. Expected YYYY-MM-DD or ISO datetime.',
         },
      )
      .transform((val) => {
         if (!val) return undefined;
         if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
            return `${val}T00:00:00Z`;
         }
         return val;
      })
      .optional(),

   requested_seats: z.coerce.number().positive().default(1).optional(),

   page: z.coerce.number().default(1).optional(),
   limit: z.coerce.number().default(10).optional(),
   sort_by: z.string().optional(),
   sort_order: z.string().optional(),

   conditioner: z.coerce.boolean().optional(),
   smoking_allowed: z.coerce.boolean().optional(),
   door_pickup: z.coerce.boolean().optional(),
   food_stop: z.coerce.boolean().optional(),
   max_two_back: z.coerce.boolean().optional(),
   pets_allowed: z.coerce.boolean().optional(),
   parcels_allowed: z.coerce.boolean().optional(),
   garage: z.enum(GarageStatus).optional(),
});

export type searchTripPublicDto = z.infer<typeof searchTripPublicSchema>;
