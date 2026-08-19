import { Request, Response } from 'express';
import * as parcelService from '../service/parcelService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import {
   cancelParcelSchema,
   createParcelSchema,
   parcelIdParamsSchema,
   parcelTripParamsSchema,
} from '../models/dto/parcelDto';
import { ZodError } from 'zod';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';

export const createParcel = async (req: Request, res: Response) => {
   try {
      const senderId = req.user.id;
      const body = createParcelSchema.parse(req.body);

      const newParcel = await parcelService.createParcel(body, senderId);

      return apiResponse.success(
         res,
         newParcel,
         'Parcel request created successfully.',
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
            operation: 'createParcel',
            userId: req.user?.id,
            tripId: req.body?.tripId,
         },
         'Failed to create parcel request. Please try again.',
      );
   }
};

export const getMyParcels = async (req: Request, res: Response) => {
   try {
      const senderId = req.user.id;
      const parcels = await parcelService.getMyParcels(senderId);
      return apiResponse.success(res, parcels, 'Parcels fetched successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getMyParcels',
            userId: req.user?.id,
         },
         'Failed to fetch your parcels. Please try again.',
      );
   }
};

export const getParcelById = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const { parcelId } = parcelIdParamsSchema.parse(req.params);

      const parcel = await parcelService.getParcelById(parcelId, userId);
      return apiResponse.success(res, parcel, 'Parcel fetched successfully.');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getParcelById',
            userId: req.user?.id,
            parcelId: req.params.parcelId,
         },
         'Failed to fetch parcel details. Please try again.',
      );
   }
};

export const getTripParcels = async (req: Request, res: Response) => {
   try {
      const driverId = req.user.id;
      const { tripId } = parcelTripParamsSchema.parse(req.params);
      const status = req.query.status as string | undefined;

      const parcels = await parcelService.getTripParcels(
         tripId,
         driverId,
         status,
      );
      return apiResponse.success(
         res,
         parcels,
         'Trip parcels fetched successfully.',
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getTripParcels',
            driverId: req.user?.id,
            tripId: req.params.tripId,
         },
         'Failed to fetch trip parcels. Please try again.',
      );
   }
};

export const cancelParcel = async (req: Request, res: Response) => {
   try {
      const senderId = req.user.id;
      const { parcelId } = parcelIdParamsSchema.parse(req.params);
      const { cancellationReason } = cancelParcelSchema.parse(req.body);

      const result = await parcelService.cancelParcel(
         parcelId,
         senderId,
         cancellationReason,
      );

      return apiResponse.success(
         res,
         { parcelId: result.parcel.id },
         'Parcel cancelled successfully.',
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
            operation: 'cancelParcel',
            userId: req.user?.id,
            parcelId: req.params.parcelId,
         },
         'Failed to cancel parcel. Please try again.',
      );
   }
};

export const confirm = async (req: Request, res: Response) => {
   try {
      const driverId = req.user.id;
      const { parcelId } = parcelIdParamsSchema.parse(req.params);

      const result = await parcelService.confirmParcel(parcelId, driverId);

      return apiResponse.success(res, result.parcel, result.message);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'confirmParcel',
            driverId: req.user?.id,
            parcelId: req.params.parcelId,
         },
         'Failed to confirm parcel. Please try again.',
      );
   }
};

export const reject = async (req: Request, res: Response) => {
   try {
      const driverId = req.user.id;
      const { parcelId } = parcelIdParamsSchema.parse(req.params);
      const { reason } = req.body ?? {};

      const result = await parcelService.rejectParcel(
         parcelId,
         driverId,
         reason,
      );

      return apiResponse.success(res, result.parcel, result.message);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'rejectParcel',
            driverId: req.user?.id,
            parcelId: req.params.parcelId,
         },
         'Failed to reject parcel. Please try again.',
      );
   }
};

export const pickup = async (req: Request, res: Response) => {
   try {
      const driverId = req.user.id;
      const { parcelId } = parcelIdParamsSchema.parse(req.params);

      const result = await parcelService.pickupParcel(parcelId, driverId);

      return apiResponse.success(res, result.parcel, result.message);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'pickupParcel',
            driverId: req.user?.id,
            parcelId: req.params.parcelId,
         },
         'Failed to mark parcel as picked up. Please try again.',
      );
   }
};

export const deliver = async (req: Request, res: Response) => {
   try {
      const driverId = req.user.id;
      const { parcelId } = parcelIdParamsSchema.parse(req.params);

      const result = await parcelService.deliverParcel(parcelId, driverId);

      return apiResponse.success(res, result.parcel, result.message);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'deliverParcel',
            driverId: req.user?.id,
            parcelId: req.params.parcelId,
         },
         'Failed to mark parcel as delivered. Please try again.',
      );
   }
};
