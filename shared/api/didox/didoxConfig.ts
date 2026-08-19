import dotenv from 'dotenv';
import process from 'node:process';
import logger from '../../utils/logger';

dotenv.config();

export const { DIDOX_URL, DIDOX_TOKEN } = process.env;

if (!DIDOX_URL) {
   logger.error('Missing required environment variables for Didox API');
}

export const header = {
   headers: {
      Authorization: `Bearer ${DIDOX_TOKEN}`,
      'accept-language': 'ru',
   },
};
