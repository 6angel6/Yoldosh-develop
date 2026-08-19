import dotenv from 'dotenv';
import process from 'node:process';
import logger from '../../utils/logger';
dotenv.config();

export const { PAYNET_LOGIN, PAYNET_PASSWORD, PAYNET_SERVICE_ID } = process.env;

if (!PAYNET_LOGIN || !PAYNET_PASSWORD || !PAYNET_SERVICE_ID) {
   logger.error('Missing required environment variables for Paynet API');
   throw new Error('Missing required environment variables for Paynet API.');
}
export const PAYNET_SERVICE_ID_INT = parseInt(PAYNET_SERVICE_ID, 10);
