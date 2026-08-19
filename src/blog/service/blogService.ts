import db from '../../../shared/config/database';
import logger from '../../../shared/utils/logger';
import {
   BadRequestError,
   NotFoundError,
} from '../../../shared/utils/errorHandler';
import {
   AdminAction,
   AdminLogEntityType,
} from '../../admin/log/models/AdminLog';
import * as adminLogService from '../../admin/log/service/adminLogService';
import * as blogRepository from '../repository/blogRepository';
import { BlogDto } from '../../../shared/utils/schemas';
import { v4 as uuidv4 } from 'uuid';

const generateSlug = (title: string) => {
   return (
      title
         .toLowerCase()
         .replace(/[^a-z0-9а-яё]+/gi, '-')
         .replace(/(^-|-$)+/g, '') +
      '-' +
      uuidv4().slice(0, 8)
   );
};

const normalizeLangField = (field?: any) => {
   if (!field) return undefined;
   return {
      ru: field.ru || '',
      uz: field.uz || '',
      en: field.en || '',
   };
};

export const createBlog = async (adminId: string, data: BlogDto) => {
   const t = await db.transaction();
   try {
      // Берем русскую версию заголовка для генерации слага
      const slug = generateSlug(data.title.ru);

      const payload: any = {
         ...data,
         subtitle: normalizeLangField(data.subtitle),
         seoTitle: normalizeLangField(data.seoTitle),
         seoDescription: normalizeLangField(data.seoDescription),
         seoKeywords: normalizeLangField(data.seoKeywords),
         slug,
         authorId: adminId,
      };

      const newBlog = await blogRepository.createBlog(payload, t);

      await t.commit();

      await adminLogService.logAction(
         adminId,
         AdminAction.CREATE_BLOG,
         undefined,
         newBlog.id,
         AdminLogEntityType.BLOG,
         {
            snapshot: {
               label: data.title.ru,
               subLabel: slug,
            },
         },
      );

      return newBlog;
   } catch (error) {
      await t.rollback();
      throw error;
   }
};

export const updateBlog = async (
   adminId: string,
   blogId: string,
   data: BlogDto,
) => {
   const t = await db.transaction();
   try {
      const blog = await blogRepository.findBlogById(blogId);
      if (!blog) throw new NotFoundError('Статья не найдена');

      let slug = blog.slug;
      // Проверяем, изменился ли русский заголовок, чтобы обновить слаг
      if (data.title.ru !== blog.title.ru) {
         slug = generateSlug(data.title.ru);
      }

      const payload: any = {
         ...data,
         subtitle: normalizeLangField(data.subtitle),
         seoTitle: normalizeLangField(data.seoTitle),
         seoDescription: normalizeLangField(data.seoDescription),
         seoKeywords: normalizeLangField(data.seoKeywords),
         slug,
      };

      const [updatedCount, updatedBlogs] = await blogRepository.updateBlog(
         blogId,
         payload,
         t,
      );

      await t.commit();

      await adminLogService.logAction(
         adminId,
         AdminAction.UPDATE_BLOG,
         undefined,
         blogId,
         AdminLogEntityType.BLOG,
         {
            snapshot: { label: data.title.ru, subLabel: slug },
         },
      );

      return updatedBlogs[0];
   } catch (error) {
      await t.rollback();
      throw error;
   }
};

export const deleteBlog = async (adminId: string, blogId: string) => {
   const blog = await blogRepository.findBlogById(blogId);
   if (!blog) throw new NotFoundError('Статья не найдена');

   await blogRepository.deleteBlog(blogId);

   await adminLogService.logAction(
      adminId,
      AdminAction.DELETE_BLOG,
      undefined,
      blogId,
      AdminLogEntityType.BLOG,
      {
         snapshot: {
            label:
               typeof blog.title === 'object' && blog.title
                  ? (blog.title as any).ru
                  : (blog.title as any),
            subLabel: blog.slug,
         },
      },
   );

   return { message: 'Статья успешно удалена' };
};

export const getPublicBlogBySlug = async (slug: string) => {
   const blog = await blogRepository.findBlogBySlug(slug);
   if (!blog || !blog.isPublished)
      throw new NotFoundError('Статья не найдена или снята с публикации');

   // Асинхронный инкремент просмотров (не блокируем ответ)
   blog
      .increment('views')
      .catch((err) => logger.warn({ err }, 'Failed to increment blog views'));

   return blog;
};
