import { Transaction } from 'sequelize';
import {
   DriverApplication,
   DriverApplicationAttributes,
   DriverApplicationStatus,
} from '../model/DriverApplication';
import logger from '../../../shared/utils/logger';

export const findDriverAppByUserId = async (
   userId: string,
   transaction?: Transaction,
): Promise<DriverApplication | null> => {
   return DriverApplication.findOne({
      where: {
         user_id: userId,
      },
      transaction,
   });
};

export const upsertDriverApplication = async (
   data: Omit<DriverApplicationAttributes, 'id' | 'status'> & {
      status: DriverApplicationStatus;
   },
   transaction?: Transaction,
): Promise<DriverApplication> => {
   // Нативный upsert делает атомарный запрос в базу.
   const [application, created] = await DriverApplication.upsert(data, {
      transaction,
      returning: true, // Обязательно, чтобы Postgres вернул обновленный инстанс
      conflictFields: ['user_id'], // Явно говорим: если юзер тот же — обновляй!
   });

   logger.info(
      { driverId: data.user_id, created },
      `DriverApplication successfully processed via native SQL UPSERT.`,
   );

   return application;
};

export const updateDriverAppStatus = async (
   application: DriverApplication,
   status: DriverApplicationStatus,
   transaction?: Transaction,
): Promise<DriverApplication> => {
   return await application.update({ status }, { transaction });
};

export const updateDriverAppLicensePath = async (
   userId: string,
   licenseFrontPath: string,
   transaction: Transaction,
): Promise<[number]> => {
   return await DriverApplication.update(
      { licenseFrontPath },
      { where: { user_id: userId }, transaction },
   );
};
