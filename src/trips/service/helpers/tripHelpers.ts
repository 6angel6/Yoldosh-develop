import { getGeoData } from '../../../../shared/utils/geoData';
import { BadRequestError } from '../../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../../shared/utils/errorCodes';
import {
   getCurrentTimeUTC,
   isInPast,
   addHours,
} from '../../../../shared/utils/timeUtils';

export const fetchBothLocations = async (
   fromLon: number,
   fromLat: number,
   toLon: number,
   toLat: number,
) => {
   const [fromGeoData, toGeoData] = await Promise.all([
      getGeoData(fromLon, fromLat),
      getGeoData(toLon, toLat),
   ]);
   return { fromGeoData, toGeoData };
};

export const validateDepartureDate = (date: Date): void => {
   if (isNaN(date.getTime()) || isInPast(date)) {
      throw new BadRequestError(
         'Invalid or past departure date',
         ErrorCode.VALIDATION_FAILED,
      );
   }
};

export const validateSeatsCount = (requested: number, max: number): void => {
   if (requested > max || requested <= 0) {
      throw new BadRequestError(
         `Seats must be between 1 and ${max}`,
         ErrorCode.VALIDATION_FAILED,
      );
   }
};

export const canStartTrip = (departureTime: Date): boolean => {
   const now = getCurrentTimeUTC();
   const fourHoursBeforeDeparture = addHours(departureTime, -4);
   return now >= fourHoursBeforeDeparture;
};

export const canCompleteTrip = (departureTime: Date): boolean => {
   const now = getCurrentTimeUTC();
   const minCompletionTime = addHours(departureTime, 40);
   return now >= minCompletionTime;
};
