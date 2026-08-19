import { Request, Response } from 'express';
import * as carService from '../service/carService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { formatZodError } from '../../../shared/utils/zodErrors';
import {
   carIdParamsSchema,
   createCarApplicationSchema,
   createDriverApplicationSchema,
   UpdateDrivereApplicationSchema,
   UploadedFiles,
} from '../model/dto/createDriverApplicationDto';
import { z } from 'zod';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';

export const createCar = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const validatedDto = createCarApplicationSchema.parse(req.body);

      const files = req.files as UploadedFiles;
      if (
         !files ||
         !files.licenseFront ||
         !files.techPassportFront ||
         !files.techPassportBack
      ) {
         return apiResponse.badRequest(
            res,
            'Missing required document files (licenseFront, techPassportFront, techPassportBack)',
         );
      }

      const result = await carService.createCar(userId, validatedDto, files);

      if (result.roleChanged && result.accessToken && result.refreshToken) {
         return apiResponse.success(
            res,
            {
               car: result.car,
               accessToken: result.accessToken,
               refreshToken: result.refreshToken,
               message:
                  'Your role has been upgraded to Driver. Please use the new tokens for subsequent requests.',
            },
            'Car application submitted successfully',
            201,
         );
      }

      return apiResponse.success(
         res,
         { car: result.car },
         'Car application submitted successfully',
         201,
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
            operation: 'createCar',
            userId: req.user?.id,
         },
         'Failed to submit car application. Please try again.',
      );
   }
};

export const resubmitCarApplication = async (req: Request, res: Response) => {
   try {
      const { id: carId } = carIdParamsSchema.parse(req.params);
      const driverId = req.user?.id;
      if (!driverId) {
         return apiResponse.unauthorized(res, 'User not authenticated');
      }

      const files = req.files as UploadedFiles;
      if (!files) {
         return apiResponse.badRequest(res, 'No files uploaded');
      }

      const validatedDto = createDriverApplicationSchema.parse(req.body);

      const car = await carService.resubmitCarApplication(
         carId,
         driverId,
         validatedDto,
         files,
      );
      return apiResponse.success(res, car, 'Car resubmitted successfully');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'resubmitCarApplication',
            userId: req.user?.id,
            carId: req.params.id,
         },
         'Failed to resubmit car application. Please try again.',
      );
   }
};

export const getCarsByDriverId = async (req: Request, res: Response) => {
   try {
      const driverId = req.user?.id;
      if (!driverId) {
         return apiResponse.unauthorized(res, 'User not authenticated');
      }
      const cars = await carService.getCarsByDriverId(driverId);
      return apiResponse.success(res, cars, 'Cars retrieved successfully');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getCarsByDriverId',
            userId: req.user?.id,
         },
         'Failed to fetch your cars. Please try again.',
      );
   }
};

export const getCarById = async (req: Request, res: Response) => {
   try {
      const { id: carId } = carIdParamsSchema.parse(req.params);
      const car = await carService.getCarById(carId);
      return apiResponse.success(res, car, 'Car retrieved successfully');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getCarById',
            carId: req.params.id,
         },
         'Failed to fetch car details. Please try again.',
      );
   }
};

export const updateCar = async (req: Request, res: Response) => {
   try {
      const driverId = req.user?.id;
      if (!driverId) {
         return apiResponse.unauthorized(res, 'User not authenticated');
      }
      const { id: carId } = carIdParamsSchema.parse(req.params);
      const updateData = UpdateDrivereApplicationSchema.parse(req.body);

      const car = await carService.updateCar(carId, driverId, updateData);
      return apiResponse.success(res, car, 'Car updated successfully');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'updateCar',
            userId: req.user?.id,
            carId: req.params.id,
         },
         'Failed to update car. Please try again.',
      );
   }
};

export const deleteCar = async (req: Request, res: Response) => {
   try {
      const driverId = req.user?.id;
      if (!driverId) {
         return apiResponse.unauthorized(res, 'User not authenticated');
      }
      const { id: carId } = carIdParamsSchema.parse(req.params);

      await carService.deleteCar(carId, driverId);
      return apiResponse.success(res, null, 'Car deleted successfully');
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'deleteCar',
            userId: req.user?.id,
            carId: req.params.id,
         },
         'Failed to delete car. Please try again.',
      );
   }
};
