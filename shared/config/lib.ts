import axios from 'axios';
import logger from '../utils/logger';
import express from 'express';

export const asyncHandler =
   (fn: any) =>
   (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
   ) => {
      Promise.resolve(fn(req, res, next)).catch(next);
   };

export const isValidPhoneNumber = (phone: string) =>
   /^\+998[0-9]{9}$/.test(phone);

export const isValidExpireDate = (expireDate: string): boolean => {
   if (!/^\d{4}$/.test(expireDate)) {
      return false;
   }
   const year = parseInt(expireDate.substring(0, 2), 10);
   const month = parseInt(expireDate.substring(2, 4), 10);
   return month >= 1 && month <= 12;
};
export const isValidCardNumber = (cardNumber: string): boolean => {
   return /^\d{16}$/.test(cardNumber);
};

export const handleError = (error: any, context: string, params?: any) => {
   if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const errorMessage = data?.error?.errorMessage || error.message;

      logger.error(
         { status, data, ...params },
         `Axios error while ${context}.`,
      );
      throw new Error(`API Error: ${errorMessage}`);
   } else {
      logger.error(
         { error, ...params },
         `An unexpected error occurred while ${context}.`,
      );
      throw error;
   }
};
