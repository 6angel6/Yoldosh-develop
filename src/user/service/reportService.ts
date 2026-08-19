import { CreateReportDto } from '../models/dto/reportValidation';
import {
   BadRequestError,
   NotFoundError,
} from '../../../shared/utils/errorHandler';
import * as userRepository from '../repository/userRepository';
import * as reportRepository from '../repository/reportRepository';
import { ReportStatus } from '../models/Report';
import logger from '../../../shared/utils/logger';
import * as tripRepository from '../../trips/repository/tripRepository';

export const createReport = async (
   reportingUserId: string,
   reportedUserId: string,
   data: CreateReportDto,
) => {
   if (reportingUserId === reportedUserId) {
      throw new BadRequestError('You cannot report yourself.');
   }
   logger.info('Creating Report  ${id}' + reportedUserId);

   const reportedUser = await userRepository.findUserById(reportedUserId);
   if (!reportedUser) {
      throw new NotFoundError(
         'The user you are trying to report does not exist.',
      );
   }

   return await reportRepository.createReport({
      userId: reportingUserId,
      reportedUserId: reportedUserId,
      reason: data.reason,
      status: ReportStatus.PENDING,
   });
};

export const createReportForTrip = async (
   reportingUserId: string,
   reportedTripId: string,
   data: CreateReportDto,
) => {
   logger.info('Creating Report ${id}' + reportedTripId);

   const reportedTrip = await tripRepository.findTripById(reportedTripId);
   if (!reportedTrip) {
      throw new NotFoundError(
         'The trip you are trying to report does not exist.',
      );
   }

   return await reportRepository.createReport({
      userId: reportingUserId,
      tripId: reportedTripId,
      reason: data.reason,
      status: ReportStatus.PENDING,
   });
};
