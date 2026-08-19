import { z } from 'zod';
import { Request, Response } from 'express';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import { tripIdParamsSchema } from '../models/dto/tripParamsDto';
import { paginationQuerySchema } from '../../../shared/utils/paginationSchema';
import { createTripSchema } from '../models/dto/tripCreateDto';
import { formatZodError } from '../../../shared/utils/zodErrors';
import { updateTripSchema } from '../models/dto/tripUpdateDto';
import {
    searchTripPublicSchema,
    searchTripSchema,
} from '../models/dto/tripSearchDto';
import * as tripService from '../service';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { UserRole } from '../../user/models/User';
import { importTripFromExternal } from '../service/tripImportService';

export const createTrip = async (req: Request, res: Response) => {
    try {
        const driverId = req.user.id;
        const tripData = createTripSchema.parse(req.body);

        const newTrip = await tripService.createTrip(driverId, tripData);

        return apiResponse.success(
            res,
            { trip: newTrip },
            'Trip created successfully.',
            201,
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
                operation: 'createTrip',
                userId: req.user?.id,
            },
            'Failed to create trip. Please check your input and try again.',
        );
    }
};

export const updateTrip = async (req: Request, res: Response) => {
    try {
        const driverId = req.user.id;
        const { tripId } = tripIdParamsSchema.parse(req.params);
        const updateData = updateTripSchema.parse(req.body);

        const updatedTrip = await tripService.updateTrip(
            tripId,
            driverId,
            updateData,
        );

        return apiResponse.success(
            res,
            updatedTrip,
            'Trip has been updated successfully.',
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
                operation: 'updateTrip',
                userId: req.user?.id,
                tripId: req.params.tripId,
            },
            'Failed to update trip. Please try again.',
        );
    }
};

export const cancelTrip = async (req: Request, res: Response) => {
    try {
        const driverId = req.user.id;
        const { tripId } = tripIdParamsSchema.parse(req.params);

        const result = await tripService.cancelTrip(tripId, driverId);

        return apiResponse.success(res, result, 'Trip cancelled successfully.');
    } catch (error) {
        return handleControllerError(
            res,
            error,
            {
                operation: 'cancelTrip',
                userId: req.user?.id,
                tripId: req.params.tripId,
            },
            'Failed to cancel trip. Please try again.',
        );
    }
};

export const startTrip = async (req: Request, res: Response) => {
    try {
        const driverId = req.user.id;
        const { tripId } = tripIdParamsSchema.parse(req.params);

        const startedTrip = await tripService.startTrip(tripId, driverId);

        return apiResponse.success(
            res,
            { trip: startedTrip },
            'Trip started successfully.',
        );
    } catch (error) {
        return handleControllerError(
            res,
            error,
            {
                operation: 'startTrip',
                userId: req.user?.id,
                tripId: req.params.tripId,
            },
            'Failed to start trip. Please try again.',
        );
    }
};

export const completeTrip = async (req: Request, res: Response) => {
    try {
        const driverId = req.user.id;
        const { tripId } = tripIdParamsSchema.parse(req.params);

        const completedTrip = await tripService.completeTrip(tripId, driverId);

        return apiResponse.success(
            res,
            { trip: completedTrip },
            'Trip completed successfully.',
        );
    } catch (error) {
        return handleControllerError(
            res,
            error,
            {
                operation: 'completeTrip',
                userId: req.user?.id,
                tripId: req.params.tripId,
            },
            'Failed to complete trip. Please try again.',
        );
    }
};

export const getTripById = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const { tripId } = tripIdParamsSchema.parse(req.params);
        const isDriver = req.user?.role === UserRole.Driver;

        const trip = await tripService.getTripById(tripId, userId, isDriver);

        return apiResponse.success(res, { trip }, 'Successfully fetched trip');
    } catch (error) {
        return handleControllerError(
            res,
            error,
            {
                operation: 'getTripById',
                userId: req.user?.id,
                tripId: req.params.tripId,
            },
            'Failed to fetch trip details. Please try again.',
        );
    }
};

export const searchTrips = async (req: Request, res: Response) => {
    try {
        const searchData = searchTripSchema.parse(req.query);
        const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);

        const identifier = {
            userId: req.user?.id,
            guestId: req.guestId,
        };

        const result = await tripService.searchTrips(
            searchData,
            page,
            limit,
            identifier,
        );

        if (result.total === 0) {
            const message =
                result.recommended_trips && result.recommended_trips.length > 0
                    ? 'На выбранную дату поездок нет, но есть похожие на другие даты.'
                    : 'No trips found matching your request.';
            return apiResponse.success(res, result, message);
        }

        return apiResponse.success(res, result, 'Trips successfully found.');
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
                operation: 'searchTrips',
                userId: req.user?.id,
            },
            'Failed to search for trips. Please try again.',
        );
    }
};

export const getMyActivity = async (req: Request, res: Response) => {
    try {
        const userId = req.user.id;
        const { role } = req.query as {
            role: 'driver' | 'passenger';
        };
        const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);

        if (!role || !['driver', 'passenger'].includes(role)) {
            return apiResponse.badRequest(
                res,
                "The 'role' query parameter is required and must be 'driver' or 'passenger'.",
            );
        }

        const result = await tripService.getUserActivity(
            userId,
            role,
            page,
            limit,
        );

        return apiResponse.success(
            res,
            result,
            'User activity successfully retrieved.',
        );
    } catch (error) {
        return handleControllerError(
            res,
            error,
            {
                operation: 'getMyActivity',
                userId: req.user?.id,
            },
            'Failed to retrieve your activity. Please try again.',
        );
    }
};

export const priceRecommendation = async (req: Request, res: Response) => {
    try {
        // Клиент передаёт полные адреса (например, с Яндекс.Карт).
        // Город извлекается автоматически из адреса.
        const priceReqSchema = z.object({
            from_address: z.string().min(3, 'from_address is required'),
            to_address: z.string().min(3, 'to_address is required'),
        });

        const { from_address, to_address } = priceReqSchema.parse(req.query);

        const result = await tripService.priceRecommendationByAddress(
            from_address,
            to_address,
        );

        return apiResponse.success(res, result, 'Success');
    } catch (error) {
        if (error instanceof z.ZodError) {
            const formattedErrors = formatZodError(error);
            return apiResponse.badRequest(
                res,
                formattedErrors,
                'Validation failed. Please provide from_city and to_city.',
            );
        }
        return handleControllerError(
            res,
            error,
            {
                operation: 'priceRecommendation',
            },
            'Failed to calculate price recommendation. Please try again.',
        );
    }
};

export const searchTripsPublic = async (req: Request, res: Response) => {
    try {
        const searchData = searchTripPublicSchema.parse(req.query);

        const page = parseInt((req.query.page as string) || '1', 10);
        const limit = parseInt((req.query.limit as string) || '10', 10);

        const result = await tripService.searchTripsPublic({
            ...searchData,
            page,
            limit,
        });

        return apiResponse.success(res, result, 'Trips found successfully.');
    } catch (error) {
        return handleControllerError(
            res,
            error,
            {
                operation: 'searchTripsPublic',
            },
            'Failed to search for trips. Please try again.',
        );
    }
};

export const getTripDetailsPublic = async (req: Request, res: Response) => {
    try {
        const { tripId } = tripIdParamsSchema.parse(req.params);

        const trip = await tripService.getTripDetailsPublic(tripId);

        if (!trip) {
            return apiResponse.notFound(res, 'Trip not found.');
        }

        return apiResponse.success(res, { trip });
    } catch (error) {
        return handleControllerError(
            res,
            error,
            {
                operation: 'getTripDetailsPublic',
                tripId: req.params.tripId,
            },
            'Failed to fetch trip details. Please try again.',
        );
    }
};

export const getTripBookings = async (req: Request, res: Response) => {
    try {
        const { tripId } = tripIdParamsSchema.parse(req.params);
        const driverId = req.user.id;
        const status = req.query.status as string | undefined;

        const bookings = await tripService.getTripBookings(
            tripId,
            driverId,
            status,
        );

        return apiResponse.success(
            res,
            { bookings },
            'Trip bookings retrieved successfully.',
        );
    } catch (error) {
        return handleControllerError(
            res,
            error,
            {
                operation: 'getTripBookings',
                userId: req.user?.id,
                tripId: req.params.tripId,
            },
            'Failed to fetch trip bookings. Please try again.',
        );
    }
};

export const getPopularTrips = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10 } = paginationQuerySchema.parse(req.query);

        const result = await tripService.getPopularTrips(page, limit);

        return apiResponse.success(res, result, 'Popular trips retrieved.');
    } catch (error) {
        return handleControllerError(
            res,
            error,
            { operation: 'getPopularTrips' },
            'Failed to fetch popular trips. Please try again.',
        );
    }
};

export const importTripsFromExternalSource = async (
    req: Request,
    res: Response,
) => {
    try {
        const result = await importTripFromExternal(req.body);

        if (!result) {
            return apiResponse.success(
                res,
                null,
                'Trip skipped — duplicate active trip exists for this driver and route.',
                200,
            );
        }

        return apiResponse.success(
            res,
            result,
            'Trip imported successfully.',
            201,
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
            { operation: 'importTripsFromExternalSource' },
            'Failed to import trips from external source. Please try again.',
        );
    }
};

export const getBestTrips = async (req: Request, res: Response) => {
    try {
        const parsedLimit = parseInt((req.query.limit as string) || '5', 10);
        const limit = Math.min(
            Number.isNaN(parsedLimit) || parsedLimit <= 0 ? 5 : parsedLimit,
            20,
        );

        const result = await tripService.getBestTrips(limit);

        return apiResponse.success(res, result, 'Best trips retrieved.');
    } catch (error) {
        return handleControllerError(
            res,
            error,
            { operation: 'getBestTrips' },
            'Failed to fetch best trips. Please try again.',
        );
    }
};