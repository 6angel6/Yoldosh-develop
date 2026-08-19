import process from 'node:process';
import logger from '../../utils/logger';

export const IPAK_YULI_URL = process.env.IPAK_YULI_URL;
export const IPAK_YULI_TOKEN = process.env.IPAK_YULI_TOKEN;
export const IPAK_USER = process.env.IPAK_USER;
export const IPAK_PASSWORD = process.env.IPAK_PASSWORD;

if (!IPAK_YULI_URL || !IPAK_YULI_TOKEN) {
   logger.error('Missing required environment variables for IpakYuli API');
}

export const header = {
   headers: {
      Authorization: `Bearer ${IPAK_YULI_TOKEN}`,
      'Content-Type': 'application/json',
   },
};
