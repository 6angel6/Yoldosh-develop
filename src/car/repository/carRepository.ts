import Car, { CarCreationAttributes, CarAttributes } from '../model/Car';
import User from '../../user/models/User';
import { Op, Transaction, Sequelize } from 'sequelize';
import logger from '../../../shared/utils/logger';

export const createCar = async (
   carData: CarCreationAttributes,
   transaction?: Transaction,
): Promise<Car> => {
   logger.debug(
      { carDataForCreate: carData },
      'Data object passed to Car.create',
   );
   return await Car.create(carData, { transaction });
};

export const findCarByGovNumber = async (
   driverId: string,
   govNumber: string,
   transaction?: Transaction,
): Promise<Car | null> => {
   return await Car.findOne({
      where: {
         driver_id: driverId,
         govNumber: govNumber,
      },
      transaction,
   });
};

export const findCarByDriverMakeModel = async (
   driverId: string,
   make: string | undefined,
   model: string | undefined,
   transaction?: Transaction,
): Promise<Car | null> => {
   const where: Record<string, unknown> = { driver_id: driverId };
   if (make) where.make = make;
   if (model) where.model = model;
   return await Car.findOne({ where, transaction });
};

export const findCarByIdWithFullInfo = async (
   carId: string,
   transaction?: Transaction,
): Promise<Car | null> => {
   return await Car.findByPk(carId, {
      include: [
         {
            model: User,
            as: 'driver',
            attributes: [
               'id',
               'firstName',
               'lastName',
               'phoneNumber',
               'avatar',
               'rating',
               'role',
            ],
         },
      ],
      transaction,
   });
};

export const findCarsByDriverId = async (
   driverId: string,
   transaction?: Transaction,
): Promise<Car[]> => {
   return await Car.findAll({
      where: { driver_id: driverId },
      order: [['createdAt', 'DESC']],
      transaction,
   });
};

export const findCarById = async (
   carId: string,
   transaction?: Transaction,
): Promise<Car | null> => {
   return await Car.findByPk(carId, { transaction });
};

export const saveCar = async (
   car: Car,
   transaction?: Transaction,
): Promise<Car> => {
   return await car.save({ transaction });
};

export const deleteCar = async (
   car: Car,
   transaction?: Transaction,
): Promise<void> => {
   await car.destroy({ transaction });
};

export const updateCarById = async (
   carId: string,
   updates?: Partial<CarAttributes>,
   transaction?: Transaction,
): Promise<[number]> => {
   return await Car.update(updates, {
      where: { id: carId },
      transaction,
   });
};

export const findAllCarsWithDetails = async (options: {
   limit: number;
   offset: number;
   sortBy: string;
   sortOrder: string;
   search?: string;
   startDate?: string;
   endDate?: string;
}): Promise<{
   rows: Car[];
   count: number;
}> => {
   const { limit, offset, sortBy, sortOrder, search, startDate, endDate } =
      options;
   const whereClause: any = {};
   const includeClause: any[] = [
      {
         model: User,
         as: 'driver',
         attributes: [
            'id',
            'firstName',
            'lastName',
            'phoneNumber',
            'avatar',
            'role',
         ],
      },
   ];

   if (search) {
      whereClause[Op.or] = [
         { govNumber: { [Op.iLike]: `%${search}%` } },
         { '$driver.firstName$': { [Op.iLike]: `%${search}%` } },
         { '$driver.lastName$': { [Op.iLike]: `%${search}%` } },
         { '$driver.phoneNumber$': { [Op.iLike]: `%${search}%` } },
         { modelName: { [Op.iLike]: `%${search}%` } },
      ];
   }

   if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
         whereClause.created_at = {
            [Op.between]: [start, end],
         };
      }
   }

   const validSortFields: {
      [key: string]: string | ReturnType<typeof Sequelize.literal>;
   } = {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      carYear: 'yearManufactured',
      licensePlate: 'govNumber',
      driverName: Sequelize.literal('"driver"."firstName"'),
   };
   const sortField = validSortFields[sortBy] || 'createdAt';
   const orderDirection = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
   return await Car.findAndCountAll({
      where: whereClause,
      include: includeClause,
      limit,
      offset,
      order: [[sortField, orderDirection]],
      distinct: true,
      subQuery: false,
   });
};
