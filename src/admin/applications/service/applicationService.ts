import db from '../../../../shared/config/database';
import {
   DriverApplication,
   DriverApplicationStatus,
} from '../../../car/model/DriverApplication';
import { Car } from '../../../car/model/Car';
import { AdminAction, AdminLogEntityType } from '../../log/models/AdminLog';
import {
   BadRequestError,
   NotFoundError,
} from '../../../../shared/utils/errorHandler';
import * as adminLogService from '../../log/service/adminLogService';
import * as userRepository from '../../../user/repository/userRepository';
import { Op } from 'sequelize';
import { User, UserRole } from '../../../user/models/User';

export const updateApplicationStatus = async (
   adminId: string,
   applicationId: string,
   status: DriverApplicationStatus.VERIFIED | DriverApplicationStatus.REJECTED,
) => {
   const t = await db.transaction();
   try {
      const application = await DriverApplication.findByPk(applicationId, {
         transaction: t,
      });

      if (!application) {
         throw new NotFoundError('Application not found.');
      }

      if (
         application.status !== DriverApplicationStatus.PENDING &&
         application.status !== DriverApplicationStatus.FAILED_DIDOX
      ) {
         throw new BadRequestError(
            `Cannot change status from '${application.status}'.`,
         );
      }

      application.status = status;
      await application.save({ transaction: t });

      if (status === DriverApplicationStatus.VERIFIED) {
         await userRepository.changeUserRole(
            application.user_id,
            UserRole.Driver,
            t,
         );
         await userRepository.updatePassportStatus(
            application.user_id,
            true,
            t,
         );
      }

      await t.commit();

      await adminLogService.logAction(
         adminId,
         AdminAction.CHANGE_APP_STATUS,
         undefined,
         application.id,
         AdminLogEntityType.DRIVER_APPLICATION,
         {
            snapshot: {
               label: `Заявка водителя ${application.id.slice(0, 8)}…`,
               subLabel: status,
               meta: { userId: application.user_id },
            },
            metadata: { status },
         },
      );

      return application;
   } catch (error) {
      await t.rollback();
      throw error;
   }
};

export const getAllApplications = async (options: {
   page: number;
   limit: number;
   status?: string;
   search?: string;
}) => {
   const { page, limit, status, search } = options;
   const offset = (page - 1) * limit;

   const whereClause: any = {};

   if (status) {
      whereClause.status = status;
   }

   if (search) {
      whereClause[Op.or] = [
         { first_name: { [Op.iLike]: `%${search}%` } },
         { last_name: { [Op.iLike]: `%${search}%` } },
         { phone: { [Op.iLike]: `%${search}%` } },
         { licensePinfl: { [Op.iLike]: `%${search}%` } },
      ];
   }

   const { rows, count } = await DriverApplication.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true,
      include: [
         {
            model: User,
            as: 'user',
            attributes: {
               exclude: ['otp', 'otpExpires', 'fcmToken', 'fcm_token'],
            },
            required: false,
            include: [
               {
                  model: Car,
                  as: 'cars',
                  required: false,
                  separate: true,
                  order: [['createdAt', 'DESC']],
               },
            ],
         },
      ],
   });

   return {
      applications: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};

export const updateApplicationFull = async (
   adminId: string,
   applicationId: string,
   data: {
      application?: {
         first_name?: string;
         last_name?: string;
         middle_name?: string;
         phone?: string;
         licensePinfl?: string;
         typeOfLicence?: string;
      };
      car?: {
         carId: string;
         govNumber?: string;
         make?: string;
         model?: string;
         color?: string;
         seats?: number;
         techPassportSerial?: string;
         issueDate?: string;
         licensePinfl?: string;
         typeOfLicence?: string;
      };
      user?: {
         firstName?: string;
         lastName?: string;
         gender?: string;
         date_of__birthday?: string;
         preferredLanguage?: string;
         preferred_navigator?: string;
         talkative?: boolean;
         music_allowed?: boolean;
         pets_allowed?: boolean;
         bio?: string;
      };
   },
) => {
   const t = await db.transaction();
   try {
      const application = await DriverApplication.findByPk(applicationId, {
         transaction: t,
      });
      if (!application) throw new NotFoundError('Application not found.');

      if (data.application && Object.keys(data.application).length > 0) {
         const appFields = [
            'first_name',
            'last_name',
            'middle_name',
            'phone',
            'licensePinfl',
            'typeOfLicence',
         ] as const;
         for (const field of appFields) {
            if (data.application[field] !== undefined) {
               (application as any)[field] = data.application[field];
            }
         }
         await application.save({ transaction: t });
      }

      if (data.car?.carId) {
         const car = await Car.findByPk(data.car.carId, { transaction: t });
         if (!car) throw new NotFoundError('Car not found.');

         const carFields = [
            'govNumber',
            'make',
            'model',
            'color',
            'seats',
            'techPassportSerial',
            'issueDate',
            'licensePinfl',
            'typeOfLicence',
         ] as const;
         for (const field of carFields) {
            if (data.car[field] !== undefined) {
               (car as any)[field] = data.car[field];
            }
         }
         await car.save({ transaction: t });
      }

      if (data.user && Object.keys(data.user).length > 0) {
         const userFields = [
            'firstName',
            'lastName',
            'gender',
            'date_of__birthday',
            'preferredLanguage',
            'preferred_navigator',
            'talkative',
            'music_allowed',
            'pets_allowed',
            'bio',
         ] as const;
         const updatePayload: Record<string, any> = {};
         for (const field of userFields) {
            if (data.user[field] !== undefined) {
               updatePayload[field] = data.user[field];
            }
         }
         if (Object.keys(updatePayload).length > 0) {
            await User.update(updatePayload, {
               where: { id: application.user_id },
               transaction: t,
            });
         }
      }

      await t.commit();

      await adminLogService.logAction(
         adminId,
         AdminAction.CHANGE_APP_STATUS,
         undefined,
         application.id,
         AdminLogEntityType.DRIVER_APPLICATION,
         {
            snapshot: {
               label: `Заявка водителя ${application.id.slice(0, 8)}…`,
               subLabel: 'Данные отредактированы',
               meta: { userId: application.user_id },
            },
            metadata: { updatedSections: Object.keys(data) },
         },
      );

      return application;
   } catch (error) {
      await t.rollback();
      throw error;
   }
};
