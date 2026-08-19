import { Request, Response } from 'express';
import * as searchService from '../service/searchService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';

export const getSearchHistory = async (req: Request, res: Response) => {
   try {
      const userId = req.user?.id;
      const guestId = req.guestId;

      if (!userId && !guestId) {
         return apiResponse.success(
            res,
            { history: [] },
            'No user or guest session found.',
         );
      }

      const history = await searchService.getSearchHistory({ userId, guestId });

      return apiResponse.success(res, { history });
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getSearchHistory',
            userId: req.user?.id,
         },
         'Failed to fetch search history. Please try again.',
      );
   }
};
