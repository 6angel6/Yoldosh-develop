import { Request, Response } from 'express';
import * as apiResponse from '../../../shared/utils/apiResponse';
import * as promocodeService from '../service/promocodeService';
import logger from '../../../shared/utils/logger';
import {
   ConflictError,
   NotFoundError,
} from '../../../shared/utils/errorHandler';
import { PromoCodeType } from '../models/PromoCode';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import { promoCodeIdParamsSchema } from '../models/dto/promocodeParamsDto';
import { paginationQuerySchema } from '../../../shared/utils/paginationSchema';

export const grantPromoCode = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin.id;
      const { userId, discountPercentage, type, useAmount, expiresAt } =
         req.body ?? {};

      if (!type || !Object.values(PromoCodeType).includes(type)) {
         return apiResponse.badRequest(
            res,
            'A valid promo code type is required.',
         );
      }

      if (type === PromoCodeType.SINGLE_USER && !userId) {
         return apiResponse.badRequest(
            res,
            'User ID is required for single-user promo codes.',
         );
      }

      if (type === PromoCodeType.GLOBAL && (!useAmount || useAmount < 1)) {
         return apiResponse.badRequest(
            res,
            'A valid use amount is required for global promo codes.',
         );
      }

      if (
         !discountPercentage ||
         typeof discountPercentage !== 'number' ||
         discountPercentage < 1
      ) {
         return apiResponse.badRequest(
            res,
            'A valid discount percentage is required.',
         );
      }

      const promoCode = await promocodeService.grantPromoCode({
         adminId,
         userId,
         discountPercentage,
         type,
         useAmount,
         expiresAt,
      });

      return apiResponse.success(
         res,
         promoCode,
         'Promo code granted successfully.',
         201,
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'grantPromoCode',
            adminId: req.admin?.id,
            userId: req.body?.userId,
         },
         'Failed to grant promo code. Please try again.',
      );
   }
};

export const getGlobalPromoCodes = async (req: Request, res: Response) => {
   try {
      const promoCodes = await promocodeService.getGlobalPromoCodes();
      return apiResponse.success(res, { promoCodes: promoCodes || [] });
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getGlobalPromoCodes',
      });
   }
};

export const getUserPromoCodes = async (req: Request, res: Response) => {
   try {
      const promoCodes = await promocodeService.getUserPromoCodes();
      return apiResponse.success(res, { promoCodes: promoCodes || [] });
   } catch (error) {
      return handleControllerError(res, error, {
         operation: 'getUserPromoCodes',
      });
   }
};

export const getAllPromoCodes = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const result = await promocodeService.getAllPromoCodes({
         page,
         limit,
      });
      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getAllPromoCodes',
         },
         'Failed to fetch promo codes. Please try again.',
      );
   }
};

export const deletePromoCode = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin.id;
      const { promoCodeId } = promoCodeIdParamsSchema.parse(req.params);
      const result = await promocodeService.deletePromoCode(
         adminId,
         promoCodeId,
      );
      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'deletePromoCode',
            adminId: req.admin?.id,
            promoCodeId: req.params.promoCodeId,
         },
         'Failed to delete promo code. Please try again.',
      );
   }
};

export const getMyPromoCode = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const promoCodes = await promocodeService.getMyPromoCode(userId);
      return apiResponse.success(res, {
         promoCodes: promoCodes || [],
         hasActivePromoCode: promoCodes.length > 0,
      });
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getMyPromoCode',
            userId: req.user?.id,
         },
         'Failed to fetch your promo codes. Please try again.',
      );
   }
};

export const activatePromoCode = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const { code } = req.body ?? {};
      if (!code) {
         return apiResponse.badRequest(res, 'Promo code is required.');
      }
      const result = await promocodeService.activateGlobalPromoCode(
         userId,
         code,
      );
      return apiResponse.success(
         res,
         result,
         'Promo code activated successfully.',
      );
   } catch (error) {
      if (error instanceof NotFoundError || error instanceof ConflictError) {
         return apiResponse.error(res, error.message, error.statusCode);
      }
      logger.error({ err: error }, 'Error activating promo code');
      return apiResponse.error(res, 'Server error activating promo code.', 500);
   }
};
