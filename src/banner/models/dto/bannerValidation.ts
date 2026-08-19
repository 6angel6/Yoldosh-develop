import { z } from 'zod';
import { BannerType, MediaType } from '../Banner';

const multiLang = z.object({
   ru: z.string().default(''),
   uz: z.string().default(''),
   en: z.string().default(''),
});

const media = z.object({
   type: z.enum(MediaType),
   url: z.url(),
});

export const bannerSchema = z.object({
   type: z.enum(BannerType),
   placement: z.string().min(1),
   title: multiLang.optional(),
   body: multiLang.optional(),
   media: media.optional(),
   action_url: z.string().optional(),
   priority: z.coerce.number().int().default(0),
   start_at: z.coerce.date().optional(),
   end_at: z.coerce.date().optional(),
   is_active: z.coerce.boolean().default(true),
   // Зарезервировано  под фазу 2 — принимаем как есть, не используем.
   targeting: z.any().optional(),
   frequency: z.any().optional(),
});
export type BannerDto = z.infer<typeof bannerSchema>;
