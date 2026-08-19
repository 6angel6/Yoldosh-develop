import z from 'zod';
import { ReportStatus } from '../../src/user/models/Report';

export const wordSchema = z.object({
   word: z.string().min(2, 'Word must be at least 2 characters long.'),
});

export const createAdminSchema = z.object({
   email: z.email(),
   firstName: z.string().min(1),
   lastName: z.string().min(1),
});

export const banUserSchema = z.object({
   reason: z.string().min(10),
   durationInDays: z.number().int().positive().nullable().optional(),
});

export type banUserDTO = z.infer<typeof banUserSchema>;

export const updateReportStatusSchema = z.object({
   status: z.enum(
      [ReportStatus.RESOLVED, ReportStatus.REJECTED],
      'Status is required.',
   ),
});

export type UpdateReportStatusDto = z.infer<typeof updateReportStatusSchema>;

const multiLangString = z.object({
   ru: z.string().min(1, 'Обязательно на русском'),
   uz: z.string().min(1, 'Обязательно на узбекском'),
   en: z.string().min(1, 'Обязательно на английском'),
});

const multiLangOptionalString = z
   .object({
      ru: z.string().optional().nullable(),
      uz: z.string().optional().nullable(),
      en: z.string().optional().nullable(),
   })
   .optional()
   .nullable();

export const blogSchema = z.object({
   title: multiLangString,
   subtitle: multiLangOptionalString,
   content: multiLangString, // Markdown контент
   coverImage: z.string().optional().nullable(), // Одно фото для всех языков
   isPublished: z.boolean().default(false),
   seoTitle: multiLangOptionalString,
   seoDescription: multiLangOptionalString,
   seoKeywords: multiLangOptionalString,
});

export type BlogDto = z.infer<typeof blogSchema>;
