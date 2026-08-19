import dotenv from 'dotenv';
import { Readable } from 'stream';
import {
   S3Client,
   PutObjectCommand,
   GetObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';
import logger from '../utils/logger';

dotenv.config();

/**
 * Объектное хранилище для медиа баннеров (фото/видео).
 * MinIO держим ВНУТРЕННИМ (только docker-сеть) — наружу не выставляем.
 * И загрузка, и отдача идут ЧЕРЕЗ наш API: браузер/приложение к MinIO не ходят.
 *   - upload  : админка шлёт файл в API (multipart) → API кладёт объект в MinIO (PutObject).
 *   - download: клиент дёргает GET /api/v1/banners/media/:file → API стримит из MinIO (GetObject).
 *
 * ENV:
 *   S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL — обязательны.
 *   S3_ENDPOINT — ВНУТРЕННИЙ адрес MinIO, к которому подключается сам API
 *                 (docker: http://minio:9000, локально: http://localhost:9002).
 *   S3_PUBLIC_BASE_URL — база публичной ссылки, которая ложится в media.url и по которой
 *                        клиент качает файл (наш Node-роут, напр. https://api.yoldosh.uz/api/v1/banners/media).
 *   S3_REGION (по умолч. 'auto'), S3_FORCE_PATH_STYLE ('true' для MinIO).
 */
const {
   S3_REGION = 'auto',
   S3_ENDPOINT,
   S3_BUCKET,
   S3_ACCESS_KEY_ID,
   S3_SECRET_ACCESS_KEY,
   S3_PUBLIC_BASE_URL,
   S3_FORCE_PATH_STYLE,
} = process.env;

export const isStorageConfigured = (): boolean =>
   !!(
      S3_BUCKET &&
      S3_ACCESS_KEY_ID &&
      S3_SECRET_ACCESS_KEY &&
      S3_PUBLIC_BASE_URL
   );

let _client: S3Client | null = null;
const client = (): S3Client => {
   if (_client) return _client;
   _client = new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT || undefined,
      forcePathStyle: S3_FORCE_PATH_STYLE === 'true',
      credentials: {
         accessKeyId: S3_ACCESS_KEY_ID as string,
         secretAccessKey: S3_SECRET_ACCESS_KEY as string,
      },
   });
   return _client;
};

// Разрешённые типы медиа для баннеров: content-type -> расширение файла.
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
   'image/jpeg': 'jpg',
   'image/png': 'png',
   'image/webp': 'webp',
   'image/gif': 'gif',
   'video/mp4': 'mp4',
   'video/quicktime': 'mov',
   'video/webm': 'webm',
};

export const isAllowedContentType = (contentType: string): boolean =>
   !!ALLOWED_CONTENT_TYPES[contentType];

const requireConfigured = () => {
   if (!isStorageConfigured()) {
      throw new Error(
         'Object storage is not configured (S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_PUBLIC_BASE_URL)',
      );
   }
};

// Публичная ссылка на объект: база (Node-роут) + ключ. Кладётся в media.url в БД.
const publicUrlForKey = (key: string): string =>
   `${(S3_PUBLIC_BASE_URL as string).replace(/\/$/, '')}/${key}`;

export interface UploadResult {
   key: string;
   url: string;
}

/**
 * Кладёт файл (уже в памяти, от multer) в MinIO. Имя генерим сами — ключ плоский
 * (uuid.ext, без папок), чтобы download-роут /media/:file был без path-traversal.
 */
export const uploadBannerMedia = async (
   body: Buffer,
   contentType: string,
): Promise<UploadResult> => {
   requireConfigured();
   const ext = ALLOWED_CONTENT_TYPES[contentType];
   if (!ext) throw new Error(`Unsupported content type: ${contentType}`);

   const key = `${uuid()}.${ext}`;
   await client().send(
      new PutObjectCommand({
         Bucket: S3_BUCKET,
         Key: key,
         Body: body,
         ContentType: contentType,
      }),
   );
   logger.debug({ key }, 'Uploaded banner media to storage');
   return { key, url: publicUrlForKey(key) };
};

export interface DownloadResult {
   body: Readable;
   contentType?: string;
   contentLength?: number;
   contentRange?: string;
   statusCode?: number; // 206 при частичном ответе (Range), иначе undefined
}

/**
 * Отдаёт объект из MinIO для стриминга клиенту. Поддерживает Range (перемотка видео).
 */
export const getBannerMedia = async (
   key: string,
   range?: string,
): Promise<DownloadResult> => {
   requireConfigured();
   const out = await client().send(
      new GetObjectCommand({
         Bucket: S3_BUCKET,
         Key: key,
         Range: range || undefined,
      }),
   );
   return {
      body: out.Body as Readable,
      contentType: out.ContentType,
      contentLength: out.ContentLength,
      contentRange: out.ContentRange,
      statusCode: out.ContentRange ? 206 : undefined,
   };
};
