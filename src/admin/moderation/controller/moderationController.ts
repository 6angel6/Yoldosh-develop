import logger from '../../../../shared/utils/logger';
import { z } from 'zod';
import { Request, Response } from 'express';
import { wordSchema } from '../../../../shared/utils/schemas';
import { formatZodError } from '../../../../shared/utils/zodErrors';
import { NotFoundError } from '../../../../shared/utils/errorHandler';
import * as moderationService from '../service/moderationService';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import { wordIdParamsSchema } from '../../dto/adminParamsDto';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const addRestrictedWord = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin.id;
      const validatedData = wordSchema.parse(req.body);
      const newWord = await moderationService.addRestrictedWord(
         adminId,
         validatedData.word,
      );
      return apiResponse.success(res, newWord, 'Word added successfully.', 201);
   } catch (error) {
      if (error instanceof z.ZodError) {
         return apiResponse.badRequest(res, formatZodError(error));
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'addRestrictedWord',
            adminId: req.admin?.id,
         },
         'Failed to add restricted word. Please try again.',
      );
   }
};

export const getRestrictedWords = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const {
         sortBy = 'createdAt',
         sortOrder = 'DESC',
         search,
      } = req.query as { [key: string]: string };

      const result = await moderationService.getRestrictedWords({
         page,
         limit,
         sortBy,
         sortOrder,
         search,
      });

      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getRestrictedWords',
            adminId: req.admin?.id,
         },
         'Failed to fetch restricted words. Please try again.',
      );
   }
};

export const deleteRestrictedWord = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin.id;
      const { wordId } = wordIdParamsSchema.parse(req.params);
      await moderationService.deleteRestrictedWord(
         adminId,
         parseInt(wordId, 10),
      );
      return apiResponse.success(res, null, 'Word deleted successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'deleteRestrictedWord',
            adminId: req.admin?.id,
            wordId: req.params.wordId,
         },
         'Failed to delete restricted word. Please try again.',
      );
   }
};
