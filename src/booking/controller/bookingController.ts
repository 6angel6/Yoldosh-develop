import { Request, Response } from 'express';
import * as bookingService from '../service/bookingService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import {
   bookingIdParamsSchema,
   cancelBookingSchema,
   createBookingSchema,
   updateBookingSchema,
} from '../models/dto/bookingCreateDto';
import { ZodError } from 'zod';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';

export const createBooking = async (req: Request, res: Response) => {
   try {
      const passengerId = req.user.id;
      const body = createBookingSchema.parse(req.body);

      const newBooking = await bookingService.createBooking(body, passengerId);

      return apiResponse.success(
         res,
         newBooking,
         'Booking created successfully.',
         201,
      );
   } catch (error) {
      if (error instanceof ZodError) {
         return apiResponse.badRequest(
            res,
            error.issues[0]?.message || 'Validation failed',
         );
      }
      return handleControllerError(
         res,
         error,
         {
            operation: 'createBooking',
            userId: req.user?.id,
            tripId: req.body?.tripId,
         },
         'Failed to create booking. Please try again.',
      );
   }
};

export const cancelBooking = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const { bookingId } = bookingIdParamsSchema.parse(req.params);
      const { cancellationReason } = cancelBookingSchema.parse(req.body);

      const result = await bookingService.cancelBooking(
         bookingId,
         userId,
         cancellationReason,
      );

      return apiResponse.success(
         res,
         {
            bookingId: result.booking.id,
         },
         'Booking cancelled successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'cancelBooking',
            userId: req.user?.id,
            bookingId: req.params.bookingId,
         },
         'Failed to cancel booking. Please try again.',
      );
   }
};

export const updateBooking = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const { bookingId } = bookingIdParamsSchema.parse(req.params);
      const { seatsBooked } = updateBookingSchema.parse(req.body);

      const result = await bookingService.updateBooking(
         bookingId,
         userId,
         seatsBooked,
      );

      return apiResponse.success(
         res,
         {
            bookingId: result.booking.id,
         },
         'Booking updated successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'updateBooking',
            userId: req.user?.id,
            bookingId: req.params.bookingId,
         },
         'Failed to update booking. Please try again.',
      );
   }
};

export const getMyBookings = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const bookings = await bookingService.getMyBookings(userId);
      return apiResponse.success(
         res,
         bookings,
         'Bookings fetched successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getMyBookings',
            userId: req.user?.id,
         },
         'Failed to fetch your bookings. Please try again.',
      );
   }
};

export const getBookingDetailsByIdForDriver = async (
   req: Request,
   res: Response,
) => {
   try {
      const { bookingId } = bookingIdParamsSchema.parse(req.params);
      const driverId = req.user.id;

      const booking = await bookingService.getBookingForDriver(
         bookingId,
         driverId,
      );
      return apiResponse.success(res, booking, 'Booking fetched successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getBookingDetailsByIdForDriver',
            bookingId: req.params.bookingId,
            driverId: req.user?.id,
         },
         'Failed to fetch booking details. Please try again.',
      );
   }
};

export const confirm = async (req: Request, res: Response) => {
   try {
      const driverId = req.user.id;
      const { bookingId } = bookingIdParamsSchema.parse(req.params);

      const result = await bookingService.confirmBooking(bookingId, driverId);

      return apiResponse.success(res, result.booking, result.message);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'confirmBooking',
            driverId: req.user?.id,
            bookingId: req.params.bookingId,
         },
         'Failed to confirm booking. Please try again.',
      );
   }
};

export const reject = async (req: Request, res: Response) => {
   try {
      const driverId = req.user.id;
      const { bookingId } = bookingIdParamsSchema.parse(req.params);
      const { reason } = req.body ?? {};

      const result = await bookingService.rejectBooking(
         bookingId,
         driverId,
         reason,
      );

      return apiResponse.success(res, result.booking, result.message);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'rejectBooking',
            driverId: req.user?.id,
            bookingId: req.params.bookingId,
         },
         'Failed to reject booking. Please try again.',
      );
   }
};
