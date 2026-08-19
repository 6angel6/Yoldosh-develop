import logger from '../../../../shared/utils/logger';
import { z } from 'zod';
import { Request, Response } from 'express';
import { formatZodError } from '../../../../shared/utils/zodErrors';
import {
   banUserSchema,
   updateReportStatusSchema,
} from '../../../../shared/utils/schemas';
import {
   BadRequestError,
   ConflictError,
   NotFoundError,
} from '../../../../shared/utils/errorHandler';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import * as reportsService from '../service/reportsService';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import { reportIdParamsSchema } from '../../dto/adminParamsDto';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const getAllReports = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const {
         status,
         sortBy = 'createdAt',
         sortOrder = 'DESC',
         search,
         startDate,
         endDate,
         range,
         from,
         to,
      } = req.query as { [key: string]: string };

      if (!status) {
         return apiResponse.badRequest(
            res,
            "Query parameter 'status' is required for reports.",
         );
      }
      const pagination = paginationQuerySchema.safeParse(req.query);
      if (!pagination.success) {
         return apiResponse.badRequest(res, 'Invalid pagination parameters.');
      }
      const { page: pageNum = 1, limit: limitNum = 10 } = pagination.data;

      const result = await reportsService.getAllReports({
         adminId,
         status,
         page: pageNum,
         limit: limitNum,
         sortBy: sortBy || 'createdAt',
         sortOrder: sortOrder || 'DESC',
         search,
         startDate,
         endDate,
         range,
         from,
         to,
      });

      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getAllReports',
            adminId: req.admin?.id,
         },
         'Failed to fetch reports. Please try again.',
      );
   }
};

export const changeReportStatus = async (req: Request, res: Response) => {
   try {
      const { reportId } = reportIdParamsSchema.parse(req.params);
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const validatedData = updateReportStatusSchema.parse(req.body);

      if (
         validatedData.status !== 'RESOLVED' &&
         validatedData.status !== 'REJECTED'
      ) {
         return apiResponse.badRequest(
            res,
            'Admin can only set status to RESOLVED or REJECTED.',
         );
      }

      const updatedReport = await reportsService.changeReportStatus(
         adminId,
         reportId,
         validatedData.status,
      );
      return apiResponse.success(
         res,
         updatedReport,
         'Report status updated successfully.',
      );
   } catch (error) {
      if (error instanceof z.ZodError) {
         return apiResponse.badRequest(
            res,
            formatZodError(error),
            'Validation failed.',
         );
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'changeReportStatus',
            adminId: req.admin?.id,
            reportId: req.params.reportId,
         },
         'Failed to update report status. Please try again.',
      );
   }
};

export const banUserByReport = async (req: Request, res: Response) => {
   try {
      const { reportId } = reportIdParamsSchema.parse(req.params);
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const validatedData = banUserSchema.parse(req.body);

      const { reason, durationInDays } = validatedData;
      const result = await reportsService.banUserByReport(
         adminId,
         reportId,
         reason,
         durationInDays,
      );
      return apiResponse.success(
         res,
         result,
         'The user has been successfully blocked based on a complaint.',
      );
   } catch (error) {
      if (error instanceof z.ZodError) {
         return apiResponse.badRequest(
            res,
            formatZodError(error),
            'Validation error.',
         );
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'banUserByReport',
            adminId: req.admin?.id,
            reportId: req.params.reportId,
         },
         'Failed to ban user based on report. Please try again.',
      );
   }
};
