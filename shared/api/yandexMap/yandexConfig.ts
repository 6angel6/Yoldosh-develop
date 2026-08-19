import dotenv from 'dotenv';
import process from 'node:process';
import logger from '../../utils/logger';

dotenv.config();

export const YANDEX_GEOCODER =
   process.env.YANDEX_GEOCODER || '7b8cbb59-702e-4b75-be73-45c70fb2c8da';
export const YANDEX_URL =
   process.env.YANDEX_URL || 'https://geocode-maps.yandex.ru/v1';

if (!YANDEX_GEOCODER || !YANDEX_URL) {
   logger.error('Missing required environment variables for Yandex API');
}
