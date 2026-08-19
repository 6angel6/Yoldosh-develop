import express from 'express';
import { asyncHandler } from '../../shared/config/lib';
import * as bannerController from './controller/bannerController';

const router = express.Router();

router.get('/', asyncHandler(bannerController.getBanners));
// Отдача медиа баннера (фото/видео) из MinIO — публичный, без авторизации.
router.get('/media/:file', asyncHandler(bannerController.getMedia));

export default router;
