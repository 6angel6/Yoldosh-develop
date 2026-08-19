import { Request, Response } from 'express';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import { blogSchema } from '../../../../shared/utils/schemas';
import * as blogService from '../../../blog/service/blogService';
import * as blogRepository from '../../../blog/repository/blogRepository';
import { adminIdOnlyParamsSchema } from '../../dto/adminParamsDto';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const createBlog = async (req: Request, res: Response) => {
   try {
      const adminId = req.user?.id || req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const validatedData = blogSchema.parse(req.body);
      const newBlog = await blogService.createBlog(adminId, validatedData);

      return apiResponse.success(res, newBlog, 'Статья создана', 201);
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'createBlog',
         adminId: req.admin?.id,
      });
   }
};

export const updateBlog = async (req: Request, res: Response) => {
   try {
      const adminId = req.user?.id || req.admin?.id;

      if (!adminId) return apiResponse.unauthorized(res);

      const { id } = adminIdOnlyParamsSchema.parse(req.params);
      const validatedData = blogSchema.parse(req.body);
      const updatedBlog = await blogService.updateBlog(
         adminId,
         id,
         validatedData,
      );

      return apiResponse.success(res, updatedBlog, 'Статья обновлена');
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'updateBlog',
         adminId: req.admin?.id,
      });
   }
};

export const deleteBlog = async (req: Request, res: Response) => {
   try {
      const adminId = req.user?.id || req.admin?.id;

      const { id } = adminIdOnlyParamsSchema.parse(req.params);
      const result = await blogService.deleteBlog(adminId, id);

      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'deleteBlog',
         adminId: req.admin?.id,
      });
   }
};

export const getAllBlogs = async (req: Request, res: Response) => {
   try {
      const { page: pageNum = 1, limit: limitNum = 10 } =
         paginationQuerySchema.parse(req.query);
      const {
         sortBy = 'createdAt',
         sortOrder = 'DESC',
         search,
         isPublished,
      } = req.query as any;

      const result = await blogRepository.findAllBlogsAdmin({
         page: pageNum,
         limit: limitNum,
         offset: (pageNum - 1) * limitNum,
         sortBy,
         sortOrder,
         search,
         isPublished,
      });

      return apiResponse.success(res, {
         blogs: result.rows,
         total: result.count,
         totalPages: Math.ceil(result.count / limitNum),
         currentPage: pageNum,
      });
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getAllBlogsAdmin',
      });
   }
};

export const uploadImage = async (req: Request, res: Response) => {
   try {
      if (!req.file) {
         return apiResponse.badRequest(res, 'Файл не загружен');
      }
      // Возвращаем публичный путь для Markdown/Обложки
      const imageUrl = `/public/blogs/media/${req.file.filename}`;
      return apiResponse.success(
         res,
         { url: imageUrl },
         'Изображение загружено',
      );
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'uploadBlogImage',
      });
   }
};
