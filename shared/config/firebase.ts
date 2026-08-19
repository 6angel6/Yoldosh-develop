import path from 'path';
import logger from '../utils/logger';
import * as admin from 'firebase-admin';

export const initFirebase = () => {
   try {
      const serviceAccountPath = path.join(process.cwd(), 'fcm.json');

      admin.initializeApp({
         credential: admin.credential.cert(serviceAccountPath),
      });

      logger.info('Firebase Admin SDK initialized successfully.');
   } catch (error) {
      logger.error(
         {
            err: error,
            stack: error instanceof Error ? error.stack : undefined,
         },
         'Failed to initialize Firebase Admin SDK - push notifications will not work',
      );
      // Non-critical - app can continue without Firebase
   }
};
