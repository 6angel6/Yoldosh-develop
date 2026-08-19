import { Request, Response } from 'express';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import * as bannerService from '../../../banner/service/bannerService';
import { bannerSchema } from '../../../banner/models/dto/bannerValidation';
import { isAllowedContentType } from '../../../../shared/config/storage';
import { adminIdOnlyParamsSchema } from '../../dto/adminParamsDto';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const createBanner = async (req: Request, res: Response) => {
   try {
      const adminId = req.user?.id || req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const data = bannerSchema.parse(req.body);
      const banner = await bannerService.createBanner(adminId, data);
      return apiResponse.success(res, banner, 'Баннер создан', 201);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'createBanner' });
   }
};

export const updateBanner = async (req: Request, res: Response) => {
   try {
      const adminId = req.user?.id || req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { id } = adminIdOnlyParamsSchema.parse(req.params);
      const data = bannerSchema.parse(req.body);
      const banner = await bannerService.updateBanner(id, data);
      return apiResponse.success(res, banner, 'Баннер обновлён');
   } catch (error) {
      return handleControllerError(res, error, { operation: 'updateBanner' });
   }
};

export const deleteBanner = async (req: Request, res: Response) => {
   try {
      const { id } = adminIdOnlyParamsSchema.parse(req.params);
      const result = await bannerService.deleteBanner(id);
      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(res, error, { operation: 'deleteBanner' });
   }
};

export const getAllBanners = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 20 } = paginationQuerySchema.parse(req.query);

      const result = await bannerService.listBannersAdmin(page, limit);
      return apiResponse.success(res, {
         banners: result.rows,
         total: result.count,
         totalPages: Math.ceil(result.count / limit),
         currentPage: page,
      });
   } catch (error) {
      return handleControllerError(res, error, { operation: 'getAllBanners' });
   }
};

// POST /admin/banner/media — загрузка фото/видео (multipart, поле "media").
// Файл едет в API → API кладёт его в MinIO. Возвращаем { key, url }; url ставим в media.url баннера.
export const uploadMedia = async (req: Request, res: Response) => {
   try {
      if (!req.file) {
         return apiResponse.badRequest(res, 'Файл не загружен (поле "media")');
      }
      if (!isAllowedContentType(req.file.mimetype)) {
         return apiResponse.badRequest(
            res,
            `Неподдерживаемый тип файла: ${req.file.mimetype}. Разрешены jpg/png/webp/gif, mp4/mov/webm.`,
         );
      }
      const result = await bannerService.uploadMedia(
         req.file.buffer,
         req.file.mimetype,
      );
      return apiResponse.success(res, result, 'Медиа загружено');
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'uploadBannerMedia',
      });
   }
};
