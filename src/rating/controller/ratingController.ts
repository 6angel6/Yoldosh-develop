import { Request, Response } from 'express';
import * as ratingService from '../service/ratingService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import { ratingUserIdParamsSchema } from '../models/dto/ratingParamsDto';
import { paginationQuerySchema } from '../../../shared/utils/paginationSchema';

export const createRating = async (req: Request, res: Response) => {
   try {
      const ratingById = req.user.id;
      const { tripId, ratedUserId, rating, feedback } = req.body ?? {};

      if (!tripId || !ratedUserId || !rating) {
         return apiResponse.badRequest(
            res,
            'tripId, ratedUserId, and rating are required.',
         );
      }

      const newRating = await ratingService.createRating({
         tripId,
         ratingById,
         ratedUserId,
         rating: Number(rating),
         feedback,
      });

      return apiResponse.success(
         res,
         newRating,
         'Rating submitted successfully.',
         201,
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'createRating',
            userId: req.user?.id,
            tripId: req.body?.tripId,
            ratedUserId: req.body?.ratedUserId,
         },
         'Failed to submit rating. Please try again.',
      );
   }
};

export const getRatingsForUser = async (req: Request, res: Response) => {
   try {
      const { userId } = ratingUserIdParamsSchema.parse(req.params);
      const pagination = paginationQuerySchema.safeParse(req.query);
      if (!pagination.success) {
         return apiResponse.badRequest(
            res,
            'Page and limit must be positive numbers.',
         );
      }
      const { page = 1, limit = 10 } = pagination.data;

      const result = await ratingService.getRatingsForUser(userId, page, limit);

      return apiResponse.success(res, result, 'Ratings fetched successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getRatingsForUser',
            userId: req.params.userId,
         },
         'Failed to fetch ratings. Please try again.',
      );
   }
};
