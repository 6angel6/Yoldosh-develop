import db from '../../../../shared/config/database';
import logger from '../../../../shared/utils/logger';
import { ReportStatus } from '../../../user/models/Report';
import { AdminAction, AdminLogEntityType } from '../../log/models/AdminLog';
import {
   BadRequestError,
   ConflictError,
   NotFoundError,
} from '../../../../shared/utils/errorHandler';
import * as reportsRepository from '../repository/reportsRepository';
import * as adminLogService from '../../log/service/adminLogService';
import * as userRepository from '../../../user/repository/userRepository';
import * as reportRepository from '../../../user/repository/reportRepository';
import { clearCache } from '../../../../shared/config/redis';

export const getAllReports = async (options: {
   adminId: string;
   status: string;
   page: number;
   limit: number;
   sortBy: string;
   sortOrder: string;
   search?: string;
   startDate?: string;
   endDate?: string;
   range?: string;
   from?: string;
   to?: string;
}) => {
   const {
      adminId,
      status,
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      startDate,
      endDate,
      range,
      from,
      to,
   } = options;
   let reportStatuses: ReportStatus[];
   switch (status?.toUpperCase()) {
      case 'PENDING':
         reportStatuses = [ReportStatus.PENDING];
         break;
      case 'RESOLVED':
         reportStatuses = [ReportStatus.RESOLVED];
         break;
      case 'REJECTED':
         reportStatuses = [ReportStatus.REJECTED];
         break;
      default:
         reportStatuses = [ReportStatus.PENDING];
         logger.debug(
            'Defaulting to fetch PENDING reports as no valid status was provided.',
         );
         break;
   }

   const offset = (page - 1) * limit;
   const { count, rows } = await reportsRepository.getAllReports(
      reportStatuses,
      limit,
      offset,
      { sortBy, sortOrder, search, startDate, endDate, range, from, to },
   );
   await adminLogService.logAction(
      adminId,
      AdminAction.VIEW_REPORTS,
      undefined,
      undefined,
      undefined,
      { metadata: { status: status || 'PENDING', resultCount: count, page } },
   );
   return {
      reports: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};

export const changeReportStatus = async (
   adminId: string,
   reportId: string,
   newStatus: ReportStatus.RESOLVED | ReportStatus.REJECTED,
) => {
   const t = await db.transaction();
   try {
      const report = await reportRepository.findReportById(reportId, t);
      if (!report) {
         throw new NotFoundError(`Report with ID ${reportId} not found.`);
      }

      if (report.status !== ReportStatus.PENDING) {
         throw new BadRequestError(
            `Cannot update a report that is already '${report.status}'.`,
         );
      }

      report.status = newStatus;
      const updatedReport = await report.save({ transaction: t });

      await t.commit();

      await adminLogService.logAction(
         adminId,
         AdminAction.CHANGE_REPORT_STATUS,
         undefined,
         reportId,
         AdminLogEntityType.REPORT,
         {
            snapshot: {
               label: `Report ${reportId.slice(0, 8)}…`,
               subLabel: report.reason?.slice(0, 80),
               meta: {
                  reportedUserId: report.reportedUserId,
                  reportingUserId: report.userId,
                  tripId: report.tripId,
               },
            },
            metadata: { from: ReportStatus.PENDING, to: newStatus },
         },
      );
      return updatedReport;
   } catch (error) {
      await t.rollback();
      throw error;
   }
};

export const banUserByReport = async (
   adminId: string,
   reportId: string,
   reason: string,
   durationInDays?: number | null,
) => {
   const t = await db.transaction();
   try {
      const report = await reportRepository.findReportById(reportId, t);
      if (!report) {
         throw new NotFoundError('Жалоба не найдена');
      }

      if (report.status !== ReportStatus.PENDING) {
         throw new BadRequestError('Action already performed for this report.');
      }

      const userIdToBan = report.reportedUserId;
      if (!userIdToBan) {
         throw new BadRequestError(
            'No user specified in this report for blocking.',
         );
      }

      const userToBan = await userRepository.findUserById(userIdToBan, t);
      if (!userToBan) {
         throw new NotFoundError('User specified in report not found');
      }

      if (userToBan.isBanned) {
         throw new ConflictError('This user is already blocked.');
      }

      userToBan.isBanned = true;
      userToBan.banReason = reason;
      if (durationInDays) {
         const expiryDate = new Date();
         expiryDate.setDate(expiryDate.getDate() + durationInDays);
         userToBan.banExpiresAt = expiryDate;
      } else {
         userToBan.banExpiresAt = null;
      }
      await userToBan.save({ transaction: t });

      report.status = ReportStatus.RESOLVED;
      await report.save({ transaction: t });

      await t.commit();

      await clearCache(`user:profile:${userToBan.id}`).catch((err) =>
         logger.warn({ err }, 'Cache invalidation failed'),
      );
      await clearCache(`user:activity:${userToBan.id}:*`).catch((err) =>
         logger.warn({ err }, 'Cache invalidation failed'),
      );

      await adminLogService.logAction(
         adminId,
         AdminAction.BAN_USER,
         `Reason: ${reason}. Duration: ${durationInDays ?? 'Permanent'} days.`,
         userToBan.id,
         AdminLogEntityType.USER,
         {
            snapshot: {
               label:
                  [userToBan.firstName, userToBan.lastName]
                     .filter(Boolean)
                     .join(' ') || userToBan.phoneNumber,
               subLabel: userToBan.phoneNumber,
               meta: { role: userToBan.role, viaReportId: reportId },
            },
            metadata: {
               reason,
               durationInDays: durationInDays ?? null,
               reportId,
            },
         },
      );
      const { otp, otpExpires, fcmToken, ...bannedUserInfo } = userToBan.get({
         plain: true,
      });
      return {
         message: `User ${userToBan.firstName} blocked successfully.`,
         bannedUser: bannedUserInfo,
      };
   } catch (error) {
      await t.rollback();
      throw error;
   }
};
