import axios, { AxiosError } from 'axios';
import logger from '../../utils/logger';
import { measureExternalCall } from '../../utils/appMetrics';
import {
   keepAliveHttpAgent,
   keepAliveHttpsAgent,
} from '../../utils/httpAgents';
import jwt, { JwtPayload } from 'jsonwebtoken';
import dotenv from 'dotenv';
import * as process from 'node:process';

dotenv.config();

const { ESKIZ_EMAIL, ESKIZ_PASS, ESKIZ_URL } = process.env;

if (!ESKIZ_EMAIL || !ESKIZ_PASS || !ESKIZ_URL) {
   logger.error('Missing required environment variables for Eskiz API');
   throw new Error('Missing required environment variables for Eskiz API.');
}

let currentToken: string | null = null;

// Без таймаута зависший Eskiz держит соединение бесконечно, а sendSMS стоит
// в горячем пути request-otp — каждый запрос кода ждал бы вечно.
const ESKIZ_TIMEOUT_MS = 5_000;

const getTokenEskiz = async (): Promise<string | null> => {
   try {
      const requestBody = new URLSearchParams();
      requestBody.append('email', ESKIZ_EMAIL);
      requestBody.append('password', ESKIZ_PASS);

      const response = await axios.post(
         `${ESKIZ_URL}/auth/login`,
         requestBody,
         {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: ESKIZ_TIMEOUT_MS,
            httpAgent: keepAliveHttpAgent,
            httpsAgent: keepAliveHttpsAgent,
         },
      );

      if (response.data?.data?.token) {
         logger.info('Successfully fetched new Eskiz token.');
         return response.data.data.token;
      }

      throw new Error('Token not found in Eskiz login response.');
   } catch (err: any) {
      logger.error(
         {
            message: 'Failed to get Eskiz auth token',
            error: err.response?.data || err.message,
         },
         'Eskiz API Login Error',
      );
      return null;
   }
};

const refreshTokenEskiz = async (currentToken: string): Promise<string> => {
   try {
      const response = await axios.patch(
         `${ESKIZ_URL}/auth/refresh`,
         {},
         {
            headers: { Authorization: `Bearer ${currentToken}` },
            timeout: ESKIZ_TIMEOUT_MS,
            httpAgent: keepAliveHttpAgent,
            httpsAgent: keepAliveHttpsAgent,
         },
      );

      if (response.data?.data?.token) {
         logger.info('Successfully refreshed Eskiz token.');
         return response.data.data.token;
      }

      throw new Error('New token not found in Eskiz refresh response.');
   } catch (err: any) {
      logger.error(
         {
            message: 'Failed to refresh Eskiz token',
            error: (err as AxiosError).response?.data || err.message,
         },
         'Eskiz API Refresh Error',
      );
      throw new Error('Eskiz token refresh failed.');
   }
};

export const getValidToken = async (): Promise<string | null> => {
   if (currentToken) {
      const decoded = jwt.decode(currentToken) as JwtPayload | null;
      if (decoded && decoded.exp) {
         const now = Math.floor(new Date().getTime() / 1000);
         const isExpired = now >= decoded.exp;

         if (!isExpired) {
            return currentToken;
         }

         currentToken = await refreshTokenEskiz(currentToken);
         return currentToken;
      }
   }
   currentToken = await getTokenEskiz();
   return currentToken;
};

export const sendSMS = async (
   phoneNumber: string,
   message: string,
   retried = false,
): Promise<void> => {
   const token = await getValidToken();

   if (!token) {
      logger.error('Cannot send SMS because Eskiz token is unavailable.');
      throw new Error('Failed to send SMS due to auth issues.');
   }

   try {
      const requestData = {
         mobile_phone: phoneNumber,
         message: message,
         from: '4546 ',
      };

      const requestConfig = {
         headers: { Authorization: `Bearer ${token}` },
         timeout: ESKIZ_TIMEOUT_MS,
         httpAgent: keepAliveHttpAgent,
         httpsAgent: keepAliveHttpsAgent,
      };

      const response = await measureExternalCall('eskiz_sms', () =>
         axios.post(
            `${ESKIZ_URL}/message/sms/send`,
            requestData,
            requestConfig,
         ),
      );

      if (response.data.status !== 'success') {
         logger.warn(
            { eskizResponse: response.data },
            'Eskiz returned a non-success status for SMS.',
         );
      } else {
         logger.info(
            { eskizResponse: response.data },
            'SMS sent successfully via Eskiz',
         );
      }
   } catch (err: any) {
      if (err.response?.status === 401 && !retried) {
         logger.warn(
            'Eskiz token expired or invalid. Attempting to refresh and retry...',
         );
         currentToken = null;
         return await sendSMS(phoneNumber, message, true);
      }
      logger.error(
         {
            message: 'Eskiz SMS sending failed',
            error: err.response?.data || err.message,
         },
         'Eskiz API Send Error',
      );

      throw new Error('Failed to send SMS via Eskiz');
   }
};
