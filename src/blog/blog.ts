import express from 'express';
import { asyncHandler } from '../../shared/config/lib';
import * as publicBlogController from './controller/blogController';

const router = express.Router();

// Выдача всех постов для лэндинга
router.get('/', asyncHandler(publicBlogController.getPublicBlogs));
// Выдача конкретного поста по слагу
router.get('/:slug', asyncHandler(publicBlogController.getBlogBySlug));

export default router;
