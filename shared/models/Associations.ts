import User from '../../src/user/models/User';
import Car from '../../src/car/model/Car';
import DriverApplication from '../../src/car/model/DriverApplication';
import Trip from '../../src/trips/models/Trip';
import logger from '../utils/logger';
import Rating from '../../src/rating/models/Rating';
import Booking from '../../src/booking/models/Booking';
import Transaction from '../../src/payment/models/Transaction';
import Payment from '../../src/payment/models/Payment';
import Wallet from '../../src/payment/models/Wallet';
import Chat from '../../src/chat/models/Chat';
import Message from '../../src/chat/models/Message';
import Notification from '../../src/chat/models/Notification';
import Report from '../../src/user/models/Report';
import PromoCode from '../../src/promocode/models/PromoCode';
import Search from '../../src/user/models/Search';
import FiscalReceipt from '../../src/payment/models/FiscalReceipt';
import ReferralCode from '../../src/promocode/models/ReferralCode';
import Referral from '../../src/promocode/models/Referral';
import UserBlocks from '../../src/user/models/UserBlocks';
import Admin from '../../src/admin/auth/models/Admin';
import Blog from '../../src/blog/models/Blog';
import City from '../../src/city/models/City';
import DriverPattern from '../../src/trips/predictor/models/DriverPattern';
import PredictionLog from '../../src/trips/predictor/models/PredictionLog';
import Parcel from '../../src/parcel/models/Parcel';

/**
 * Ассоциации регистрируются один раз на процесс. Вызывают их из двух мест
 * (src/main.ts при старте и test/setup.ts перед db.sync), а повторный вызов
 * падает с SequelizeAssociationError: alias уже занят.
 */
let associationsReady = false;

export const setupAssociations = () => {
   if (associationsReady) return;
   associationsReady = true;

   User.hasOne(DriverApplication, {
      foreignKey: 'user_id',
      as: 'driverApplication',
      onDelete: 'CASCADE',
   });
   DriverApplication.belongsTo(User, {
      foreignKey: 'user_id',
      as: 'user',
   });

   User.hasMany(Car, {
      foreignKey: 'driver_id',
      as: 'cars',
      onDelete: 'CASCADE',
   });
   Car.belongsTo(User, {
      foreignKey: 'driver_id',
      as: 'driver',
   });

   User.hasMany(Trip, {
      foreignKey: 'driver_id',
      as: 'drivenTrips',
      onDelete: 'CASCADE',
   });
   Trip.belongsTo(User, {
      foreignKey: 'driver_id',
      as: 'driver',
   });

   // Trip → City (город отправления/прибытия) — используется в 2-волновом поиске
   Trip.belongsTo(City, { foreignKey: 'from_city_id', as: 'fromCity' });
   Trip.belongsTo(City, { foreignKey: 'to_city_id', as: 'toCity' });
   City.hasMany(Trip, { foreignKey: 'from_city_id', as: 'tripsFrom' });
   City.hasMany(Trip, { foreignKey: 'to_city_id', as: 'tripsTo' });

   User.hasMany(Booking, {
      foreignKey: 'passengerId',
      as: 'bookingsAsPassenger',
   });
   Booking.belongsTo(User, {
      foreignKey: 'passengerId',
      as: 'passenger',
   });

   User.hasMany(Rating, { foreignKey: 'ratingById', as: 'givenRatings' });
   User.hasMany(Rating, { foreignKey: 'ratedUserId', as: 'receivedRatings' });
   Rating.belongsTo(User, { foreignKey: 'ratingById', as: 'ratingBy' });
   Rating.belongsTo(User, { foreignKey: 'ratedUserId', as: 'ratedUser' });

   Car.hasMany(Trip, { foreignKey: 'car_id', as: 'trips' });
   Trip.belongsTo(Car, { foreignKey: 'car_id', as: 'car' });

   Trip.hasMany(Booking, {
      foreignKey: 'tripId',
      as: 'bookings',
      onDelete: 'CASCADE',
   });
   Booking.belongsTo(Trip, {
      foreignKey: 'tripId',
      as: 'trip',
   });

   Trip.hasMany(Rating, { foreignKey: 'tripId', as: 'ratings' });
   Rating.belongsTo(Trip, { foreignKey: 'tripId', as: 'trip' });

   // --- Посылки (MVP) ---
   Trip.hasMany(Parcel, {
      foreignKey: 'trip_id',
      as: 'parcels',
      onDelete: 'CASCADE',
   });
   Parcel.belongsTo(Trip, {
      foreignKey: 'trip_id',
      as: 'trip',
   });
   User.hasMany(Parcel, {
      foreignKey: 'sender_id',
      as: 'sentParcels',
   });
   Parcel.belongsTo(User, {
      foreignKey: 'sender_id',
      as: 'sender',
   });

   User.hasOne(Wallet, {
      foreignKey: 'userId',
      as: 'wallet',
      onDelete: 'CASCADE',
   });
   Wallet.belongsTo(User, {
      foreignKey: 'userId',
      as: 'user',
   });

   Wallet.hasMany(Transaction, {
      foreignKey: 'walletId',
      as: 'transactions',
   });
   Transaction.belongsTo(Wallet, {
      foreignKey: 'walletId',
      as: 'wallet',
   });
   Transaction.hasOne(Payment, {
      foreignKey: 'transactionId',
      as: 'paymentDetails',
      onDelete: 'CASCADE',
   });
   Payment.belongsTo(Transaction, {
      foreignKey: 'transactionId',
      as: 'transaction',
   });
   // Booking <-> Transaction (Полиморфная связь "Один ко многим")
   // Мы можем связать транзакцию напрямую с бронированием для прямых оплат
   Booking.hasMany(Transaction, {
      foreignKey: 'relatedEntityId',
      constraints: false,
      scope: {
         relatedEntityType: 'booking',
      },
      as: 'transactions',
   });

   Chat.belongsTo(User, { foreignKey: 'participant1Id', as: 'participant1' });
   Chat.belongsTo(User, { foreignKey: 'participant2Id', as: 'participant2' });

   Chat.belongsTo(Trip, { foreignKey: 'tripId', as: 'trip' });
   Trip.hasMany(Chat, { foreignKey: 'tripId', as: 'chats' });

   Message.belongsTo(Chat, { foreignKey: 'chatId', as: 'chat' });
   Chat.hasMany(Message, { foreignKey: 'chatId', as: 'messages' });

   Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
   User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });

   Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
   User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });

   Report.belongsTo(User, { as: 'reportingUser', foreignKey: 'userId' });
   Report.belongsTo(User, { as: 'reportedUser', foreignKey: 'reportedUserId' });

   User.hasMany(Report, { as: 'submittedReports', foreignKey: 'userId' });
   User.hasMany(Report, {
      as: 'receivedReports',
      foreignKey: 'reportedUserId',
   });

   User.hasOne(PromoCode, {
      foreignKey: 'userId',
      as: 'promoCode',
   });

   PromoCode.belongsTo(User, {
      foreignKey: 'userId',
      as: 'user',
   });

   Search.belongsTo(User, { foreignKey: 'userId', as: 'user' });
   Transaction.hasOne(FiscalReceipt, { foreignKey: 'transactionId' });
   FiscalReceipt.belongsTo(Transaction, { foreignKey: 'transactionId' });

   User.hasOne(ReferralCode, {
      foreignKey: 'userId',
      as: 'referralCode',
      onDelete: 'CASCADE',
   });
   ReferralCode.belongsTo(User, {
      foreignKey: 'userId',
      as: 'user',
   });

   ReferralCode.hasMany(Referral, {
      foreignKey: 'referralCodeId',
      as: 'referrals',
   });
   Referral.belongsTo(ReferralCode, {
      foreignKey: 'referralCodeId',
      as: 'referralCode',
   });

   User.hasMany(Referral, {
      foreignKey: 'referrerId',
      as: 'referredUsers',
   });
   Referral.belongsTo(User, {
      foreignKey: 'referrerId',
      as: 'referrer',
   });

   User.hasOne(Referral, {
      foreignKey: 'referredUserId',
      as: 'referredByInfo',
   });
   Referral.belongsTo(User, {
      foreignKey: 'referredUserId',
      as: 'referredUser',
   });

   User.hasMany(UserBlocks, {
      foreignKey: 'blocker_id',
      as: 'blockedUsers',
   });
   UserBlocks.belongsTo(User, {
      foreignKey: 'blocker_id',
      as: 'blocker',
   });

   User.hasMany(UserBlocks, {
      foreignKey: 'blocked_id',
      as: 'blockedBy',
   });
   UserBlocks.belongsTo(User, {
      foreignKey: 'blocked_id',
      as: 'blockedUser',
   });

   Admin.hasMany(Blog, {
      foreignKey: 'authorId',
      as: 'blogs',
   });
   Blog.belongsTo(Admin, {
      foreignKey: 'authorId',
      as: 'author',
   });

   // --- Trip Predictor (Этап 1): паттерны и журнал прогнозов ---
   DriverPattern.belongsTo(User, { foreignKey: 'driver_id', as: 'driver' });
   DriverPattern.belongsTo(City, {
      foreignKey: 'from_city_id',
      as: 'fromCity',
   });
   DriverPattern.belongsTo(City, { foreignKey: 'to_city_id', as: 'toCity' });
   DriverPattern.hasMany(Trip, {
      foreignKey: 'pattern_id',
      as: 'predictedTrips',
   });
   Trip.belongsTo(DriverPattern, { foreignKey: 'pattern_id', as: 'pattern' });
   Trip.belongsTo(Trip, { foreignKey: 'source_trip_id', as: 'sourceTrip' });

   DriverPattern.hasMany(PredictionLog, {
      foreignKey: 'pattern_id',
      as: 'logs',
   });
   PredictionLog.belongsTo(DriverPattern, {
      foreignKey: 'pattern_id',
      as: 'pattern',
   });
   PredictionLog.belongsTo(Trip, {
      foreignKey: 'predicted_trip',
      as: 'predictedTrip',
   });
   PredictionLog.belongsTo(Trip, {
      foreignKey: 'confirmed_trip',
      as: 'confirmedTrip',
   });

   logger.info('Database associations have been set up correctly');
};
