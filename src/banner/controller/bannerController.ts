import { Request, Response } from 'express';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import * as bannerService from '../service/bannerService';

// GET /v1/banners?placement=home — баннеры для экрана (клиент рендерит по type).
export const getBanners = async (req: Request, res: Response) => {
   try {
      const placement = (req.query.placement as string) || '';
      if (!placement) {
         return apiResponse.badRequest(res, 'placement is required');
      }

      const result = await bannerService.getBannersForPlacement(placement);
      return apiResponse.success(res, result, 'Banners retrieved.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         { operation: 'getBanners' },
         'Failed to fetch banners. Please try again.',
      );
   }
};

// GET /v1/banners/media/:file — стримим фото/видео баннера из MinIO.
// Файл лежит в приватной (для внешнего мира) MinIO, наружу отдаём только через API.
export const getMedia = async (req: Request, res: Response) => {
   try {
      const key = req.params.file || '';
      // Ключ плоский (uuid.ext). Пресекаем path-traversal и подкаталоги.
      if (!key || key.includes('/') || key.includes('..')) {
         return apiResponse.badRequest(res, 'Invalid media key');
      }

      const media = await bannerService.getMedia(key, req.headers.range);

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      if (media.contentType) {
         res.setHeader('Content-Type', media.contentType);
      }
      if (media.contentLength != null) {
         res.setHeader('Content-Length', String(media.contentLength));
      }
      if (media.statusCode === 206 && media.contentRange) {
         res.status(206);
         res.setHeader('Content-Range', media.contentRange);
      }

      media.body.on('error', () => {
         if (!res.headersSent) res.status(404).end();
         else res.destroy();
      });
      return media.body.pipe(res);
   } catch (error) {
      // Нет такого объекта в MinIO → 404, остальное — общая обработка.
      const code = (error as { $metadata?: { httpStatusCode?: number } })
         ?.$metadata?.httpStatusCode;
      if (code === 404 || (error as { name?: string })?.name === 'NoSuchKey') {
         return apiResponse.notFound(res, 'Media not found');
      }
      return handleControllerError(
         res,
         error,
         { operation: 'getBannerMedia' },
         'Failed to fetch media.',
      );
   }
};
