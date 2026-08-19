import { Request, Response } from 'express';
import * as bookingsService from '../service/bookingsService';
import * as apiResponse from '../../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../../shared/utils/controllerErrorHandler';
import { adminBookingIdParamsSchema } from '../../dto/adminParamsDto';
import { paginationQuerySchema } from '../../../../shared/utils/paginationSchema';

export const getAllBookings = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { page = 1, limit = 20 } = paginationQuerySchema.parse(req.query);
      const result = await bookingsService.getAllBookings({
         ...(req.query as any),
         page,
         limit,
      });
      return apiResponse.success(res, result);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getAllBookings',
            adminId: req.admin?.id,
         },
         'Failed to fetch bookings. Please try again.',
      );
   }
};

export const getBookingById = async (req: Request, res: Response) => {
   try {
      const adminId = req.admin?.id;
      if (!adminId) return apiResponse.unauthorized(res);

      const { bookingId } = adminBookingIdParamsSchema.parse(req.params);
      const booking = await bookingsService.getBookingById(bookingId);
      return apiResponse.success(res, { booking });
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getBookingById',
            adminId: req.admin?.id,
            bookingId: req.params.bookingId,
         },
         'Failed to fetch booking details. Please try again.',
      );
   }
};
