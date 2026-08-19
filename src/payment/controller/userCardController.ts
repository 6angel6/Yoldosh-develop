import { Request, Response } from 'express';
import * as apiResponse from '../../../shared/utils/apiResponse';
import * as userCardService from '../service/userCardService';
import logger from '../../../shared/utils/logger';
import { AppError } from '../../../shared/utils/errorHandler';
import { deleteCardSchema } from '../models/dto/userCardDto';

export const createUserCard = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const response = await userCardService.createUserCard(userId);
      return apiResponse.success(
         res,
         response,
         'Succesfully recieved urls for IPAK YOLI',
      );
   } catch (error) {
      // AppError от ipakApi: ошибка API банка → 400, банк недоступен → 503.
      // Прежняя ветка includes('IPAK API Error') была мёртвой — клиент бросает
      // 'Ipak API Error' в другом регистре, и всё уходило как 500.
      if (error instanceof AppError) {
         return apiResponse.error(res, error.message, error.statusCode);
      }
      if (error instanceof Error) {
         return apiResponse.internalError(res, error.message, error);
      }
      return apiResponse.internalError(
         res,
         'An unexpected error occurred.',
         error,
      );
   }
};

export const getAllUsersCards = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const cards = await userCardService.getAllUsersCards(userId);

      return apiResponse.success(
         res,
         cards,
         'Successfully retrieved user cards.',
      );
   } catch (error: any) {
      logger.error({ err: error }, 'Get all user cards controller error');

      if (error instanceof AppError) {
         return apiResponse.error(res, error.message, error.statusCode);
      }
      return apiResponse.internalError(
         res,
         'Server error while fetching user cards.',
      );
   }
};

export const deleteCard = async (req: Request, res: Response) => {
   try {
      // В Express 5 req.body бывает undefined (запрос без JSON Content-Type) —
      // прямое чтение поля давало TypeError и 500
      const parsed = deleteCardSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
         return apiResponse.badRequest(res, ['UserCardId field is required']);
      }

      const response = await userCardService.deleteCard(parsed.data.userCardId);

      return apiResponse.success(res, response, 'Card successfully deleted.');
   } catch (error) {
      if (error instanceof AppError) {
         return apiResponse.error(res, error.message, error.statusCode);
      }
      if (error instanceof Error) {
         return apiResponse.internalError(res, 'Failed to delete card.', error);
      }
      return apiResponse.internalError(
         res,
         'An unexpected error occurred.',
         error,
      );
   }
};
