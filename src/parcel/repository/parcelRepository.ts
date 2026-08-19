import { Op, Transaction } from 'sequelize';
import Parcel, { ParcelStatus } from '../models/Parcel';
import Trip from '../../trips/models/Trip';
import User from '../../user/models/User';

export interface CreateParcelData {
   trip_id: string;
   sender_id: string;

   pickup_latitude: number;
   pickup_longitude: number;
   dropoff_latitude: number;
   dropoff_longitude: number;

   from_city: string;
   to_city: string;
   from_address: string;
   to_address: string;

   price: number;
   status: ParcelStatus;
}

export interface FindParcelOptions {
   id?: string;
   trip_id?: string;
   sender_id?: string;
   status?: ParcelStatus | ParcelStatus[];
   transaction?: Transaction;
   lock?: boolean;
}

// Активная посылка — любая не в терминальном статусе
export const ACTIVE_PARCEL_STATUSES = [
   ParcelStatus.PENDING,
   ParcelStatus.CONFIRMED,
   ParcelStatus.PICKED_UP,
];

export const createParcel = async (
   data: CreateParcelData,
   transaction?: Transaction,
): Promise<Parcel> => {
   return await Parcel.create(data, { transaction });
};

export const findParcelByOptions = async (
   options: FindParcelOptions,
): Promise<Parcel | null> => {
   const whereClause: any = {};

   if (options.id) whereClause.id = options.id;
   if (options.trip_id) whereClause.trip_id = options.trip_id;
   if (options.sender_id) whereClause.sender_id = options.sender_id;

   if (options.status) {
      if (Array.isArray(options.status)) {
         whereClause.status = { [Op.in]: options.status };
      } else {
         whereClause.status = options.status;
      }
   }

   const queryOptions: any = { where: whereClause };

   if (options.transaction) {
      queryOptions.transaction = options.transaction;
      if (options.lock) {
         queryOptions.lock = options.transaction.LOCK.UPDATE;
      }
   }

   return await Parcel.findOne(queryOptions);
};

export const findActiveParcelBySenderAndTrip = async (
   tripId: string,
   senderId: string,
   transaction?: Transaction,
): Promise<Parcel | null> => {
   return await Parcel.findOne({
      where: {
         trip_id: tripId,
         sender_id: senderId,
         status: { [Op.in]: ACTIVE_PARCEL_STATUSES },
      },
      transaction,
   });
};

export const findParcelsBySender = async (senderId: string) => {
   return await Parcel.findAll({
      where: { sender_id: senderId },
      include: [
         {
            model: Trip,
            as: 'trip',
            include: [
               {
                  model: User,
                  as: 'driver',
                  attributes: [
                     'id',
                     'firstName',
                     'lastName',
                     'avatar',
                     'phoneNumber',
                     'rating',
                  ],
               },
            ],
         },
      ],
      order: [['created_at', 'DESC']],
   });
};

export const findParcelsByTrip = async (
   tripId: string,
   status?: ParcelStatus,
   transaction?: Transaction,
) => {
   const whereClause: any = { trip_id: tripId };
   if (status) {
      whereClause.status = status;
   }

   return await Parcel.findAll({
      where: whereClause,
      include: [
         {
            model: User,
            as: 'sender',
            attributes: [
               'id',
               'firstName',
               'lastName',
               'avatar',
               'phoneNumber',
               'rating',
            ],
         },
      ],
      order: [['created_at', 'DESC']],
      transaction,
   });
};

export const findActiveParcelsByTrip = async (
   tripId: string,
   transaction?: Transaction,
) => {
   return await Parcel.findAll({
      where: {
         trip_id: tripId,
         status: { [Op.in]: ACTIVE_PARCEL_STATUSES },
      },
      transaction,
   });
};

export const saveParcel = async (
   parcel: Parcel,
   transaction?: Transaction,
): Promise<Parcel> => {
   return await parcel.save({ transaction });
};

export const cancelParcelWithReason = async (
   parcelId: string,
   reason: string,
   transaction: Transaction,
   status: ParcelStatus = ParcelStatus.CANCELLED,
): Promise<void> => {
   await Parcel.update(
      {
         status,
         cancellation_reason: reason,
      },
      {
         where: { id: parcelId },
         transaction,
      },
   );
};
