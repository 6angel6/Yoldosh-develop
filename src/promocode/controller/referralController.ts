import { Request, Response } from 'express';
import * as apiResponse from '../../../shared/utils/apiResponse';
import * as referralService from '../service/referralService';
import {
   redisClient,
   getRedisAvailable,
   redisAvailable,
} from '../../../shared/config/redis';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';

import logger from '../../../shared/utils/logger';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

export const getMyReferralCode = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      if (!userId) {
         return apiResponse.unauthorized(res, 'User not authenticated.');
      }

      logger.info({ userId }, 'Request to get own referral code.');

      let referralCode = await referralService.getUserReferralCode(userId);
      if (!referralCode) {
         logger.warn({ userId }, 'Referral code not found, generating now.');
         referralCode =
            await referralService.generateAndSaveCodeForUser(userId);
         logger.info(
            { userId, code: referralCode.code },
            'Generated referral code on demand.',
         );
      }

      const backendBaseUrl =
         process.env.BACKEND_BASE_URL || 'http://localhost:5000/api/v1';
      const referralLink = `${backendBaseUrl}/referral/ref?code=${referralCode.code}`;

      logger.info(
         { userId, code: referralCode.code, ref: referralLink },
         'Successfully retrieved referral code and link pointing to backend /ref.',
      );

      return apiResponse.success(res, {
         code: referralCode.code,
         link: referralLink,
      });
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getMyReferralCode',
            userId: req.user?.id,
         },
         'Failed to fetch your referral code. Please try again.',
      );
   }
};

const createFingerPrint = async (req: Request) => {
   const ip =
      req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0].trim();
   const userAgent = req.headers['user-agent'];
   const acceptLanguage = req.headers['accept-language'];

   logger.info(
      {
         ip: req.ip,
         xForwardedFor: req.headers['x-forwarded-for'],
         userAgent: req.headers['user-agent'],
         acceptLanguage: req.headers['accept-language'],
      },
      '[createFingerPrint] Incoming request data for fingerprint',
   );

   if (!ip || !userAgent) {
      logger.warn('Fingerprint creation failed: Missing IP or User-Agent');
      return null;
   }

   const rawFingerPrint = `${ip}-${userAgent}-${acceptLanguage || ''}`;
   logger.info(
      { raw: rawFingerPrint },
      '[createFingerPrint] Generated fingerprint',
   );
   return crypto.createHash('SHA-256').update(rawFingerPrint).digest('hex');
};

export const handleReferralLink = async (req: Request, res: Response) => {
   const { code } = req.query;

   if (!code || typeof code !== 'string') {
      // TODO: Определить ОС и редиректить в нужный магазин
      return res.redirect(
         'https://play.google.com/store/apps/details?id=com.orion.notein.global&hl=ru',
      );
   }

   if (!getRedisAvailable() || !redisClient) {
      logger.warn(
         'Redis unavailable, skipping fingerprint saving for referral code.',
      );
      // TODO: Редирект в магазин
      return res.redirect(
         'https://play.google.com/store/apps/details?id=com.orion.notein.global&hl=ru',
      );
   }

   const fingerPrint = await createFingerPrint(req);

   if (fingerPrint) {
      try {
         const redisKey = `referral_fp:${fingerPrint}`;
         await redisClient.set(redisKey, code, { EX: 1800 });

         logger.info(
            { key: redisKey, code, fingerprint: fingerPrint },
            '[handleReferralLink] Saved fingerprint and code to Redis',
         );
      } catch (error) {
         logger.error({ err: error }, 'Failed to save fingerprint to Redis.');
      }
   } else {
      logger.warn({ code }, 'Could not create fingerprint for referral link.');
   }

   const userAgent = req.headers['user-agent']?.toLowerCase() || '';
   const isAndroid = /android/.test(userAgent);
   const isIOS = /iphone|ipad|ipod/.test(userAgent);

   const androidAppLink = 'notein://open?referral=true';
   const androidStoreLink =
      'https://play.google.com/store/apps/details?id=com.orion.notein.global&hl=ru';
   const iosAppLink = 'notein://open?referral=true';
   const iosStoreLink = 'https://apps.apple.com/app/idYOUR_APP_ID';

   const generateHTML = (appLink: string, storeLink: string) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Opening App...</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
      const appLink = "${appLink}";
      const storeLink = "${storeLink}";
      // Сначала пытаемся открыть приложение
      // Через 2.5 секунды редиректим в стор
      setTimeout(() => { window.location.href = storeLink; }, 2500);
    </script>
    <style>
      body {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100vh;
        font-family: Arial, sans-serif;
        background: linear-gradient(135deg, #f8f8f8, #eaeaea);
      }
      h1 {
        font-size: 2.5rem;
        font-weight: bold;
        color: #333;
        margin-bottom: 10px;
      }
      p {
        color: #666;
        font-size: 1rem;
      }
      .spinner {
        margin-top: 20px;
        width: 50px;
        height: 50px;
        border: 6px solid #ccc;
        border-top-color: #007bff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <h1>Opening App...</h1>
    <div class="spinner"></div>
    <p>Please wait a moment</p>
  </body>
</html>`;

   if (isAndroid) {
      logger.info('[Referral] Android user detected');
      return res.send(generateHTML(androidAppLink, androidStoreLink));
   } else if (isIOS) {
      logger.info('[Referral] iOS user detected');
      return res.send(generateHTML(iosAppLink, iosStoreLink));
   } else {
      logger.info('[Referral] Desktop or unknown device detected');
      return res.send(generateHTML(androidAppLink, androidStoreLink));
   }
};

const createAppFingerprint = async (appData: {
   userAgent?: string;
   language?: string;
   ip?: string;
}) => {
   const { ip, userAgent, language } = appData;

   if (!ip || !userAgent) {
      logger.warn(
         'App fingerprint creation failed: Missing IP or User-Agent from app data.',
      );
      return null;
   }

   logger.info(
      appData,
      '[createAppFingerprint] Data received from app for fingerprinting',
   );

   const rawFingerprint = `${ip}-${userAgent}-${language || ''}`;

   logger.info(
      { raw: rawFingerprint },
      '[createAppFingerprint] Generated fingerprint from app data',
   );
   return crypto.createHash('sha256').update(rawFingerprint).digest('hex');
};

export const matchInstallFingerPrint = async (req: Request, res: Response) => {
   try {
      const appReportedData = req.body ?? {};
      const ip =
         req.ip ||
         req.headers['x-forwarded-for']?.toString().split(',')[0].trim();
      if (!redisAvailable || !redisClient) {
         logger.warn('Redis unavailable, cannot perform fingerprint matching.');
         return apiResponse.success(
            res,
            { code: null },
            'Matching service unavailable.',
         );
      }

      logger.info(
         { body: appReportedData, ip },
         '[matchInstallFingerPrint] Received request from app',
      );

      const appFingerprint = await createAppFingerprint({
         ...appReportedData,
         ip,
      });

      if (!appFingerprint) {
         logger.warn(
            { ip, appData: appReportedData },
            'Failed to create fingerprint from app data.',
         );
         return apiResponse.success(
            res,
            { code: null },
            'Insufficient data for matching.',
         );
      }

      if (!getRedisAvailable() || !redisClient.isOpen) {
         logger.warn('Redis unavailable - cannot match fingerprint');
         return apiResponse.success(res, { code: null }, 'Redis unavailable.');
      }

      const redisKey = `referral_fp:${appFingerprint}`;
      const referralCode = await redisClient.get(redisKey);

      logger.info(
         { key: redisKey, appFingerprint },
         '[matchInstallFingerPrint] Looking up fingerprint in Redis',
      );

      if (referralCode) {
         logger.info(
            { fingerprint: appFingerprint, code: referralCode },
            'Fingerprint match found!',
         );
         await redisClient.del(redisKey);
         return apiResponse.success(
            res,
            { code: referralCode },
            'Match found.',
         );
      } else {
         logger.info(
            { fingerprint: appFingerprint },
            'No matching fingerprint found in Redis.',
         );
         return apiResponse.success(res, { code: null }, 'No match found.');
      }
   } catch (error) {
      logger.error(
         { err: error },
         'Error during fingerprint matching in Redis.',
      );
      return apiResponse.error(res, 'Error during matching.', 500);
   }
};
