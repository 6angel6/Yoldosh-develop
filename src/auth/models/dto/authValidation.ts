import { z } from 'zod';

const phoneNumberSchema = z
   .string()
   .regex(/^\+998[0-9]{9}$/, 'Phone number must be in format +998XXXXXXXXX')
   .min(13)
   .max(13);

const otpSchema = z
   .string()
   .regex(/^\d{4}$/, 'OTP must be exactly 4 digits')
   .length(4);

export const registerStep1Schema = z.object({
   phoneNumber: phoneNumberSchema,
   guestId: z.uuid('Invalid guest ID format').optional(),
   platform: z.enum(['ios', 'android']).optional(),
});

export type RegisterStep1Input = z.infer<typeof registerStep1Schema>;

export const registerStep2Schema = z.object({
   phoneNumber: phoneNumberSchema,
   otp: otpSchema,
});

export type RegisterStep2Input = z.infer<typeof registerStep2Schema>;

export const guestUserSchema = z.object({
   guestId: z.uuid('Invalid guest ID format'),
   fcmToken: z.string(),
});

export type guestUserSchemaDto = z.infer<typeof guestUserSchema>;

export const registerStep3Schema = z.object({
   userId: z.uuid('Invalid user ID format'),
   firstName: z
      .string()
      .min(1, 'First name is required')
      .max(32, 'First name must not exceed 32 characters')
      .trim(),
   avatar: z
      .any()
      .optional()
      .refine(
         (file) => {
            if (!file) return true;
            const validTypes = [
               'image/jpeg',
               'image/jpg',
               'image/png',
               'image/webp',
            ];
            return validTypes.includes(file?.mimetype);
         },
         { message: 'Avatar must be a valid image (JPEG, PNG, WEBP)' },
      )
      .refine(
         (file) => {
            if (!file) return true;
            const maxSize = 5 * 1024 * 1024; // 5MB
            return file?.size <= maxSize;
         },
         { message: 'Avatar file size must not exceed 5MB' },
      ),
   referralCode: z
      .string()
      .min(3, 'Referral code must be at least 3 characters')
      .max(20, 'Referral code must not exceed 20 characters')
      .trim()
      .optional(),
});

export type RegisterStep3Input = z.infer<typeof registerStep3Schema>;

export const refreshTokenSchema = z.object({
   refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
