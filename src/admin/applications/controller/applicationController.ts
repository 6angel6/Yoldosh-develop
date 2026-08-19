import logger from '../../../../shared/utils/logger';
import { Request, Response } from 'express';
import { DriverApplicationStatus } from '../../../car/model/DriverApplication';
import {
   BadRequestError,
   NotFoundError,
} from '../../../../shared/utils/errorHandler';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import * as applicationService from '../service/applicationService';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import { applicationIdParamsSchema } from '../../dto/adminParamsDto';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const updateApplicationStatus = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { applicationId } = applicationIdParamsSchema.parse(req.params);
      const { status } = req.body ?? {};

      if (
         !status ||
         (status !== DriverApplicationStatus.VERIFIED &&
            status !== DriverApplicationStatus.REJECTED)
      ) {
         return apiResponse.badRequest(res, 'Invalid status.');
      }

      const updatedApp = await applicationService.updateApplicationStatus(
         adminId,
         applicationId,
         status,
      );
      return apiResponse.success(
         res,
         updatedApp,
         `Application updated to ${status}.`,
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'updateApplicationStatus',
            adminId: req.admin?.id,
            applicationId: req.params.applicationId,
         },
         'Failed to update application status. Please try again.',
      );
   }
};

export const getAllApplications = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const { status, search } = req.query as { [key: string]: string };

      const result = await applicationService.getAllApplications({
         page,
         limit,
         status,
         search,
      });

      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getAllApplications',
            adminId: req.admin?.id,
         },
         'Failed to fetch applications. Please try again.',
      );
   }
};

export const updateApplicationFull = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { applicationId } = applicationIdParamsSchema.parse(req.params);
      const { application, car, user } = req.body ?? {};

      const updated = await applicationService.updateApplicationFull(
         adminId,
         applicationId,
         { application, car, user },
      );

      return apiResponse.success(res, updated, 'Application data updated.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'updateApplicationFull',
            adminId: req.admin?.id,
            applicationId: req.params.applicationId,
         },
         'Failed to update application data.',
      );
   }
};
