import { z } from 'zod';

export const UpdateDrivereApplicationSchema = z.object({
   make: z.string().min(1).max(15).optional(),
   model: z.string().min(1).max(30).optional(),
   color: z.string().min(1).max(15).optional(),
   seats: z.int().positive().min(1).max(8).optional(),
   govNumber: z.string().min(1).max(15).optional(),
});

export type updateDriverDataDTO = z.infer<
   typeof UpdateDrivereApplicationSchema
>;

export const createDriverApplicationSchema = z
   .object({
      licensePinfl: z.string().length(14).optional(),
      typeOfLicence: z.string().length(1).optional(),

      govNumber: z.string().min(1).max(15).optional(),
      make: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      color: z.string().min(1).optional(),
      techPassportSerial: z.string().min(1).max(10).optional(),
      issueDate: z
         .string()
         .regex(/^\d{2}-\d{2}-\d{4}$/, 'Use the format DD-MM-YEAR')
         .transform((val, ctx) => {
            const [day, month, year] = val.split('-').map(Number);
            const date = new Date(year, month - 1, day);

            if (
               date.getFullYear() !== year ||
               date.getMonth() !== month - 1 ||
               date.getDate() !== day
            ) {
               ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'Invalid date',
               });
               return z.NEVER;
            }

            return date;
         }),
      seats: z.string(),
   })
   .optional();

export type createDriverAppDto = z.infer<typeof createDriverApplicationSchema>;

/**
 * Создание заявки: `driver_applications.license_pinfl` объявлен NOT NULL,
 * поэтому пропуск поля давал не 400, а нарушение констрейнта и 500.
 * Резабмит использует схему выше — там сервис подставляет значение из
 * существующей машины (`dto.licensePinfl ?? car.licensePinfl`).
 */
export const createCarApplicationSchema = createDriverApplicationSchema
   .unwrap()
   .extend({
      licensePinfl: z.string().length(14),
   });

export type createCarAppDto = z.infer<typeof createCarApplicationSchema>;

/** `:id` машины в пути. */
export const carIdParamsSchema = z.object({
   id: z.uuid({ message: 'Invalid car ID format (UUID expected).' }),
});

export interface UploadedFiles {
   techPassportFront?: Express.Multer.File[];
   techPassportBack?: Express.Multer.File[];
   licenseFront?: Express.Multer.File[];
}
