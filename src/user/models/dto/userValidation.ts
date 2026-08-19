import { z } from 'zod';
import { NavigatorPreference, UserLanguage } from '../User';

const notificationPreferencesSchema = z.object({
   trips: z.boolean().optional(),
   newsAndAgreement: z.boolean().optional(),
   promotionAndDiscounts: z.boolean().optional(),
   messages: z.boolean().optional(),
   general: z.boolean().optional(),
});

export const updateUserProfileSchema = z.object({
   firstName: z
      .string()
      .min(1, 'First name cannot be empty.')
      .max(32)
      .optional(),
   lastName: z.string().max(32).optional(),
   bio: z.string().max(128).optional(),
   gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
   date_of__birthday: z
      .string()
      .date('Date should be in Date format')
      .optional(),

   preferred_navigator: z
      .enum([
         NavigatorPreference.YandexNavi,
         NavigatorPreference.GoogleMaps,
         NavigatorPreference.None,
      ])
      .optional(),
   preferredLanguage: z
      .enum([UserLanguage.Russian, UserLanguage.Uzbek, UserLanguage.English])
      .optional(),
   notificationPreferences: notificationPreferencesSchema.optional(),
   talkative: z.boolean().nullable().optional(),
   music_allowed: z.boolean().nullable().optional(),
   pets_allowed: z.boolean().nullable().optional(),
});

export type UpdateUserProfileDto = z.infer<typeof updateUserProfileSchema>;

/** `:id` пользователя в пути. */
export const userIdPathParamsSchema = z.object({
   id: z.uuid({ message: 'Invalid user ID format (UUID expected).' }),
});

/** Тело block-user / unblock-user: контроллеры читают его как { userId }. */
export const blockUserSchema = z.object({
   userId: z.uuid({ message: 'Invalid user ID format (UUID expected).' }),
});
