import * as carRepository from '../repository/carRepository';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';
import {
   BadRequestError,
   ConflictError,
   NotFoundError,
} from '../../../shared/utils/errorHandler';
import {
   Car,
   CarAttributes,
   CarCreationAttributes,
   CarStatus,
} from '../model/Car';
import logger from '../../../shared/utils/logger';
import db from '../../../shared/config/database';
import {
   createDriverAppDto,
   updateDriverDataDTO,
   UploadedFiles,
} from '../model/dto/createDriverApplicationDto';
import { DriverApplicationStatus } from '../model/DriverApplication';
import { UserRole } from '../../user/models/User';
import * as driverAppRepository from '../repository/driverAppRepository';
import { changeUserRole } from '../../user/repository/userRepository';
import * as walletRepository from '../../payment/repository/walletRepository';
import { findUserById } from '../../user/repository/userRepository';

const getFilePath = (files: Express.Multer.File[] | undefined): string => {
   if (!files || files.length === 0) {
      throw new BadRequestError('All document files must be uploaded.');
   }
   const fullPath = files[0].path;
   const publicPath = fullPath.split('public').pop();
   return publicPath ? `/public${publicPath.replace(/\\/g, '/')}` : fullPath;
};

export const createCar = async (
   driverId: string,
   dto: createDriverAppDto,
   files: UploadedFiles,
): Promise<{
   car: any;
   accessToken?: string;
   refreshToken?: string;
   roleChanged: boolean;
}> => {
   const driver = await findUserById(driverId);
   if (!driver) {
      throw new NotFoundError('User not found.');
   }

   const licenseFrontPath = getFilePath(files.licenseFront);
   const techPassportFrontPath = getFilePath(files.techPassportFront);
   const techPassportBackPath = getFilePath(files.techPassportBack);

   return withDeadlockRetry(async (t) => {
      const existingCar = await carRepository.findCarByGovNumber(
         driver.id,
         dto.govNumber,
         t,
      );
      if (existingCar) {
         throw new ConflictError(
            'Car with this license plate number is already added by you.',
         );
      }

      const application = await driverAppRepository.findDriverAppByUserId(
         driver.id,
         t,
      );

      if (
         !application ||
         application.status !== DriverApplicationStatus.VERIFIED
      ) {
         const driverAppData = {
            user_id: driver.id,
            phone: driver.phoneNumber, // Теперь при конфликте Postgres просто обновит эту строку, а не упадет
            licenseFrontPath,
            licensePinfl: dto.licensePinfl,
            typeOfLicence: dto.typeOfLicence,
            status: DriverApplicationStatus.PENDING,
         };

         await driverAppRepository.upsertDriverApplication(driverAppData, t);

         logger.info(
            { driverId: driver.id },
            'Driver application processed (created or updated) for verification',
         );
      } else {
         logger.info(
            { driverId: driver.id },
            'Driver already verified, adding new car only',
         );
      }

      const carDataToCreate: CarCreationAttributes = {
         driver_id: driver.id,
         techPassportFrontPath,
         techPassportBackPath,
         licenseFrontPath,
         licensePinfl: dto.licensePinfl,
         typeOfLicence: dto.typeOfLicence,
         govNumber: dto.govNumber,
         make: dto.make,
         model: dto.model,
         color: dto.color,
         techPassportSerial: dto.techPassportSerial,
         issueDate: dto.issueDate,
         seats: Number(dto.seats),
         status: CarStatus.PENDING,
      };

      const car = await carRepository.createCar(carDataToCreate, t);

      const roleChanged = driver.role === UserRole.Passenger;

      if (roleChanged) {
         await changeUserRole(driver.id, UserRole.Driver, t);
         logger.info(`User Role changed to driver, userId:${driver.id}`);
         const wallet = await walletRepository.createWallet(
            {
               userId: driver.id,
               balance: 0,
            },
            t,
         );

         logger.info(`Created wallet for the driver, walletId:${wallet.id}`);
      }

      const carWithInfo = await carRepository.findCarByIdWithFullInfo(
         car.id,
         t,
      );

      if (roleChanged) {
         const { generateAccessToken, generateRefreshToken } = await import(
            '../../../shared/utils/jwt'
         );
         const accessToken = generateAccessToken(driver.id, UserRole.Driver);
         const refreshToken = generateRefreshToken(driver.id);

         return {
            car: carWithInfo,
            accessToken,
            refreshToken,
            roleChanged: true,
         };
      }

      return {
         car: carWithInfo,
         roleChanged: false,
      };
   });
};

export const resubmitCarApplication = async (
   carId: string,
   driverId: string,
   dto: createDriverAppDto,
   files: UploadedFiles,
): Promise<Car> => {
   return withDeadlockRetry(async (t) => {
      const car = await carRepository.findCarById(carId, t);
      if (!car) {
         throw new NotFoundError('Car not found.');
      }

      if (car.driver_id !== driverId) {
         throw new BadRequestError(
            'Permission denied: You can only resubmit your own car applications.',
         );
      }
      const techPassportFrontPath = files.techPassportFront
         ? getFilePath(files.techPassportFront)
         : car.techPassportFrontPath;
      const techPassportBackPath = files.techPassportBack
         ? getFilePath(files.techPassportBack)
         : car.techPassportBackPath;

      const newLicenseFrontPath = files.licenseFront
         ? getFilePath(files.licenseFront)
         : undefined;

      const updates: Partial<CarAttributes> = {
         govNumber: dto.govNumber,
         make: dto.make,
         model: dto.model,
         color: dto.color,
         techPassportSerial: dto.techPassportSerial,
         issueDate: dto.issueDate,
         seats: parseInt(dto.seats),
         techPassportFrontPath,
         techPassportBackPath,
         licensePinfl: dto.licensePinfl ?? car.licensePinfl,
         typeOfLicence: dto.typeOfLicence ?? car.typeOfLicence,
         rejectionReason: null,
      };

      if (newLicenseFrontPath) {
         updates.licenseFrontPath = newLicenseFrontPath;
      }

      await carRepository.updateCarById(car.id, updates, t);

      if (newLicenseFrontPath) {
         await driverAppRepository.updateDriverAppLicensePath(
            driverId,
            newLicenseFrontPath,
            t,
         );
      }

      logger.info(
         { carId, driverId },
         'Car application resubmitted, status set to PENDING.',
      );

      return await carRepository.findCarById(carId, t);
   });
};

export const getCarsByDriverId = async (driverId: string): Promise<Car[]> => {
   return await carRepository.findCarsByDriverId(driverId);
};

export const getCarById = async (carId: string): Promise<CarAttributes> => {
   const car = await carRepository.findCarByIdWithFullInfo(carId);
   if (!car) {
      throw new NotFoundError('Car not found');
   }
   return car.toJSON();
};

export const updateCar = async (
   carId: string,
   driverId: string,
   updateData: updateDriverDataDTO,
): Promise<Car> => {
   return withDeadlockRetry(async (t) => {
      const car = await carRepository.findCarById(carId, t);
      if (!car) {
         throw new NotFoundError('Car not found');
      }
      if (car.driver_id !== driverId) {
         throw new BadRequestError(
            'Permission denied: You can only update your own cars.',
         );
      }

      if (updateData.color) car.color = updateData.color;
      if (updateData.seats) car.seats = Number(updateData.seats);
      if (updateData.make) car.make = updateData.make;
      if (updateData.model) car.model = updateData.model;
      if (updateData.govNumber) car.govNumber = updateData.govNumber;

      await carRepository.saveCar(car, t);
      return await carRepository.findCarById(car.id, t);
   });
};

export const deleteCar = async (
   carId: string,
   driverId: string,
): Promise<void> => {
   return withDeadlockRetry(async (t) => {
      const car = await carRepository.findCarById(carId, t);
      if (!car) {
         throw new NotFoundError('Car not found');
      }
      if (car.driver_id !== driverId) {
         throw new BadRequestError(
            'Permission denied: You can only delete your own cars.',
         );
      }
      await carRepository.deleteCar(car, t);
   });
};
