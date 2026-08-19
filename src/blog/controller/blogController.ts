import { Request, Response } from 'express';
import logger from '../../../shared/utils/logger';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import * as apiResponse from '../../../shared/utils/apiResponse';
import * as blogRepository from '../repository/blogRepository';
import { blogSlugParamsSchema } from '../models/dto/blogParamsDto';
import { paginationQuerySchema } from '../../../shared/utils/paginationSchema';

type Lang = 'ru' | 'uz' | 'en';

// Читаем язык из Accept-Language header (next-intl ставит его из локали URL)
const getLang = (req: Request): Lang => {
   const raw = req.headers['accept-language'] || '';
   // Accept-Language может быть "uz,ru;q=0.9,en;q=0.8" — берём первый тег
   const primary = raw.split(',')[0].split('-')[0].trim().toLowerCase();
   if (primary === 'ru' || primary === 'uz' || primary === 'en')
      return primary as Lang;
   return 'ru';
};

const mapBlogToLanguage = (blog: any, lang: Lang) => {
   const b = blog.toJSON ? blog.toJSON() : blog;
   return {
      ...b,
      title: b.title?.[lang] || b.title?.ru || '',
      subtitle: b.subtitle ? b.subtitle[lang] || b.subtitle.ru || null : null,
      content: b.content ? b.content[lang] || b.content.ru || null : null,
      seoTitle: b.seoTitle ? b.seoTitle[lang] || b.seoTitle.ru || null : null,
      seoDescription: b.seoDescription
         ? b.seoDescription[lang] || b.seoDescription.ru || null
         : null,
   };
};

export const getPublicBlogs = async (req: Request, res: Response) => {
   try {
      const { page: pageNum = 1, limit: limitNum = 10 } =
         paginationQuerySchema.parse(req.query);
      const { search } = req.query as any;
      const lang = getLang(req);

      const result = await blogRepository.findPublishedBlogs({
         limit: limitNum,
         offset: (pageNum - 1) * limitNum,
         search,
      });

      const localizedBlogs = result.rows.map((blog) =>
         mapBlogToLanguage(blog, lang),
      );

      return apiResponse.success(res, {
         blogs: localizedBlogs,
         total: result.count,
         totalPages: Math.ceil(result.count / limitNum),
         currentPage: pageNum,
      });
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getPublicBlogs' });
   }
};

export const getBlogBySlug = async (req: Request, res: Response) => {
   try {
      const { slug } = blogSlugParamsSchema.parse(req.params);
      const lang = getLang(req);

      // countView=false приходит от клиентских запросов (хук useBlogBySlug)
      // countView не передаётся (undefined) только при SSR запросе из page.tsx
      const shouldCount = req.query.countView !== 'false';

      const blog = await blogRepository.findBlogBySlug(slug);
      if (!blog || !blog.isPublished) {
         return apiResponse.notFound(
            res,
            'Статья не найдена или снята с публикации',
         );
      }

      if (shouldCount) {
         blogRepository
            .incrementViews(blog.id)
            .catch((err) => logger.warn({ err }, 'Failed to increment views'));
      }

      return apiResponse.success(res, mapBlogToLanguage(blog, lang));
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getBlogBySlug',
         slug: req.params.slug,
      });
   }
};
