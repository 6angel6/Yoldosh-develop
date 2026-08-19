import fs from 'fs';
import logger from '../utils/logger';
import fsPromises from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import multer from 'multer';
import { Request } from 'express';

const publicDir = path.join(process.cwd(), 'public');

const avatarDir = path.join(publicDir, 'users/avatars');
const mediaDir = path.join(publicDir, 'chat/media');
const licenseFrontDir = path.join(publicDir, 'users/verification/licenseFront');
const techPassportFrontDir = path.join(
   publicDir,
   'users/verification/techPassportFront',
);
const techPassportBackDir = path.join(
   publicDir,
   'users/verification/techPassportBack',
);
const myIdDir = path.join(publicDir, 'myid_verifications');
const blogDir = path.join(publicDir, 'blogs/media');

const dirsToEnsure = [
   avatarDir,
   mediaDir,
   licenseFrontDir,
   techPassportFrontDir,
   techPassportBackDir,
   myIdDir,
   blogDir,
];

dirsToEnsure.forEach((dir) => {
   if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const fileFilter = (
   req: Request,
   file: Express.Multer.File,
   cb: multer.FileFilterCallback,
) => {
   const allowedTypes = /jpeg|jpg|png|gif/;
   const mimetype = allowedTypes.test(file.mimetype);
   const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
   );

   if (mimetype && extname) {
      return cb(null, true);
   }
   cb(
      new Error(
         'Error: File upload only supports images (jpeg, jpg, png, gif)',
      ),
   );
};

const imageAndVideoFileFilter = (
   req: Request,
   file: Express.Multer.File,
   cb: multer.FileFilterCallback,
) => {
   const allowedImageTypes = /jpeg|jpg|png|gif/;
   const allowedVideoTypes = /mp4|mov|avi|webm|mkv/;
   const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

   if (
      allowedImageTypes.test(ext) ||
      allowedVideoTypes.test(ext) ||
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/')
   ) {
      return cb(null, true);
   }
   cb(new Error('Error: Invalid file type'));
};

export const uploadAvatar = multer({
   storage: multer.diskStorage({
      destination: (req, file, cb) => {
         cb(null, avatarDir);
      },
      filename: (req: Request, file, cb) => {
         const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
         const extension = path.extname(file.originalname);
         cb(null, `${uniqueSuffix}${extension}`);
      },
   }),
   limits: { fileSize: 1024 * 1024 * 3 }, // 3MB
   fileFilter: fileFilter,
}).single('avatar');

export const uploadMedia = multer({
   storage: multer.diskStorage({
      destination: (req, file, cb) => {
         cb(null, mediaDir);
      },
      filename: (req: Request, file, cb) => {
         const userId = req.user?.id || 'unknown';
         const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
         const extension = path.extname(file.originalname);
         cb(null, `chat-${userId}-${uniqueSuffix}${extension}`);
      },
   }),
   limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
   fileFilter: imageAndVideoFileFilter,
}).single('media');

export const uploadVerificationDocuments = multer({
   storage: multer.diskStorage({
      destination: (req, file, cb) => {
         const dirs = {
            licenseFront: licenseFrontDir,
            techPassportFront: techPassportFrontDir,
            techPassportBack: techPassportBackDir,
         };
         const dest = dirs[file.fieldname];
         if (!dest) return cb(new Error('Invalid field name'), '');
         cb(null, dest);
      },
      filename: (req: Request, file, cb) => {
         const userId = req.user?.id || 'anonymous';
         const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
         const ext = path.extname(file.originalname);
         cb(null, `${file.fieldname}-${userId}-${uniqueSuffix}${ext}`);
      },
   }),
   limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
   fileFilter,
}).fields([
   { name: 'licenseFront', maxCount: 1 },
   { name: 'techPassportFront', maxCount: 1 },
   { name: 'techPassportBack', maxCount: 1 },
]);

export const uploadMyIdPhoto = multer({
   storage: multer.diskStorage({
      destination: (req, file, cb) => {
         cb(null, myIdDir);
      },
      filename: (req, file, cb) => {
         const userId = req.user?.id || 'anonymous';
         const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
         const extension = path.extname(file.originalname);
         cb(null, `myid-${userId}-${uniqueSuffix}${extension}`);
      },
   }),
}).single('image');

export const optimizeImage = async (req, res, next) => {
   try {
      if (!req.file) return next();

      if (!req.file.mimetype.startsWith('image/')) return next();

      const inputPath = req.file.path;
      const outputPath = inputPath.replace(path.extname(inputPath), '.webp');

      await sharp(inputPath)
         .resize({ width: 1080, withoutEnlargement: true }) // withoutEnlargement чтобы не растягивать маленькие фото
         .webp({ quality: 75 })
         .toFile(outputPath);

      await fsPromises.unlink(inputPath);

      req.file.path = outputPath;
      req.file.filename = path.basename(outputPath);
      req.file.mimetype = 'image/webp'; // Важно обновить мимтайп

      next();
   } catch (error) {
      if (req.file && req.file.path) {
         await fsPromises
            .unlink(req.file.path)
            .catch((err) =>
               logger.warn({ err }, 'Failed to remove uploaded file'),
            );
      }
      next(error);
   }
};

export const uploadBlogMedia = multer({
   storage: multer.diskStorage({
      destination: (req, file, cb) => {
         cb(null, blogDir);
      },
      filename: (req: Request, file, cb) => {
         const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
         const extension = path.extname(file.originalname);
         cb(null, `blog-${uniqueSuffix}${extension}`);
      },
   }),
   limits: { fileSize: 10 * 1024 * 1024 }, // 10MB для картинок в блог
   fileFilter: fileFilter,
}).single('uploadBlogImage');

// Медиа баннеров грузим в MinIO, а не на диск — поэтому memoryStorage: файл
// приезжает в req.file.buffer, а контроллер кладёт его в объектное хранилище.
// Лимит 50MB совпадает с client_max_body_size nginx на api-домене.
export const uploadBannerMediaMemory = multer({
   storage: multer.memoryStorage(),
   limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (фото/короткое видео)
   fileFilter: imageAndVideoFileFilter,
}).single('media');
