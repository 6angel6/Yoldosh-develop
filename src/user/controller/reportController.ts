import { Request, Response } from 'express';
import * as reportService from '../service/reportService';
import {
   createReportSchema,
   userIdParamsSchema,
} from '../models/dto/reportValidation';
import { tripIdParamsSchema } from '../../trips/models/dto/tripParamsDto';
import { formatZodError } from '../../../shared/utils/zodErrors';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { z } from 'zod';
import logger from '../../../shared/utils/logger';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';

export const createUserReport = async (req: Request, res: Response) => {
   try {
      const { userId } = userIdParamsSchema.parse(req.params);

      const reportingUserId = req.user.id;

      const validatedData = createReportSchema.parse(req.body);

      const report = await reportService.createReport(
         reportingUserId,
         userId,
         validatedData,
      );

      return apiResponse.success(
         res,
         report,
         'Your report has been submitted successfully.',
      );
   } catch (error) {
      if (error instanceof z.ZodError) {
         const formattedErrors = formatZodError(error);
         return apiResponse.badRequest(
            res,
            formattedErrors,
            'Validation failed.',
         );
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'createUserReport',
            userId: req.user?.id,
            reportedUserId: req.params.userId,
         },
         'Failed to submit report. Please try again.',
      );
   }
};

export const createTripReport = async (req: Request, res: Response) => {
   try {
      const { tripId } = tripIdParamsSchema.parse(req.params);

      const reportingUserId = req.user.id;

      const validatedData = createReportSchema.parse(req.body);
      logger.debug({ tripId }, 'Reporting trip');

      const report = await reportService.createReportForTrip(
         reportingUserId,
         tripId,
         validatedData,
      );

      return apiResponse.success(
         res,
         report,
         'Your report has been submitted successfully.',
      );
   } catch (error) {
      if (error instanceof z.ZodError) {
         const formattedErrors = formatZodError(error);
         return apiResponse.badRequest(
            res,
            formattedErrors,
            'Validation failed.',
         );
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'createTripReport',
            userId: req.user?.id,
            tripId: req.params.tripId,
         },
         'Failed to submit report. Please try again.',
      );
   }
};
