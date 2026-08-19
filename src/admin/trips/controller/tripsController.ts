import logger from '../../../../shared/utils/logger';
import { Request, Response } from 'express';
import {
   BadRequestError,
   NotFoundError,
} from '../../../../shared/utils/errorHandler';
import * as tripsService from '../service/tripsService';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import {
   adminBookingIdParamsSchema,
   adminTripIdParamsSchema,
} from '../../dto/adminParamsDto';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const editTripByAdmin = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);
      const { tripId } = adminTripIdParamsSchema.parse(req.params);
      const updateData = req.body ?? {};

      const updatedTrip = await tripsService.editTripByAdmin(
         adminId,
         tripId,
         updateData,
      );
      return apiResponse.success(
         res,
         updatedTrip,
         'Trip updated successfully by admin.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'editTripByAdmin',
            adminId: req.admin?.id,
            tripId: req.params.tripId,
         },
         'Failed to update trip. Please try again.',
      );
   }
};

export const deleteTripByAdmin = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);
      const { tripId } = adminTripIdParamsSchema.parse(req.params);

      const result = await tripsService.deleteTripByAdmin(adminId, tripId);
      return apiResponse.success(
         res,
         result,
         'Trip deleted successfully by admin.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'deleteTripByAdmin',
            adminId: req.admin?.id,
            tripId: req.params.tripId,
         },
         'Failed to delete trip. Please try again.',
      );
   }
};

export const getAllTrips = async (req: Request, res: Response) => {
   try {
      const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);
      const result = await tripsService.getAllTrips({
         ...req.query,
         page,
         limit,
      });
      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getAllTrips',
            adminId: req.admin?.id,
         },
         'Failed to fetch trips. Please try again.',
      );
   }
};

export const getTripById = async (req: Request, res: Response) => {
   try {
      const { tripId } = adminTripIdParamsSchema.parse(req.params);
      const trip = await tripsService.getTripDetailsById(tripId);

      return apiResponse.success(res, { trip });
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getTripById',
            adminId: req.admin?.id,
            tripId: req.params.tripId,
         },
         'Failed to fetch trip details. Please try again.',
      );
   }
};

export const changeBookingStatusByAdmin = async (
   req: Request,
   res: Response,
) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { bookingId } = adminBookingIdParamsSchema.parse(req.params);
      const { status, reason } = req.body ?? {};

      const ALLOWED_STATUSES = ['CANCELLED', 'CONFIRMED', 'PENDING'];
      if (!status || !ALLOWED_STATUSES.includes(status)) {
         return apiResponse.badRequest(
            res,
            `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}`,
         );
      }

      const result = await tripsService.changeBookingStatusByAdmin(
         adminId,
         bookingId,
         status,
         reason,
      );
      return apiResponse.success(
         res,
         result,
         'Booking status updated by admin.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         { operation: 'changeBookingStatusByAdmin', adminId: req.admin?.id },
         'Failed to update booking status.',
      );
   }
};

export const changeTripStatusByAdmin = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { tripId } = adminTripIdParamsSchema.parse(req.params);
      const { status, reason } = req.body ?? {};

      const ALLOWED_STATUSES = ['CREATED', 'CANCELED'];
      if (!status || !ALLOWED_STATUSES.includes(status)) {
         return apiResponse.badRequest(
            res,
            `Invalid status. Admin can set: ${ALLOWED_STATUSES.join(', ')}`,
         );
      }

      const result = await tripsService.changeTripStatusByAdmin(
         adminId,
         tripId,
         status,
         reason,
      );
      return apiResponse.success(res, result, 'Trip status updated by admin.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         { operation: 'changeTripStatusByAdmin', adminId: req.admin?.id },
         'Failed to update trip status.',
      );
   }
};
