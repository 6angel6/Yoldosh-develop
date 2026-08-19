/**
 * Auto-generated TypeScript types for i18n translation keys
 * This ensures type-safety when using translation keys
 *
 * Generated: 2026-07-14T11:23:35.216Z
 * DO NOT EDIT MANUALLY - regenerate using: npm run i18n:generate-types
 */

// Notification keys
export type NotificationKeys =
   | 'notification.booking.created.passenger'
   | 'notification.booking.created.driver'
   | 'notification.booking.confirmed.passenger'
   | 'notification.booking.cancelled.passenger'
   | 'notification.booking.cancelled.driver'
   | 'notification.booking.updated.passenger'
   | 'notification.booking.updated.driver'
   | 'notification.booking.day_reminder'
   | 'notification.parcel.created.sender'
   | 'notification.parcel.created.driver'
   | 'notification.parcel.confirmed.sender'
   | 'notification.parcel.rejected.sender'
   | 'notification.parcel.cancelled.sender'
   | 'notification.parcel.cancelled.driver'
   | 'notification.parcel.picked_up.sender'
   | 'notification.parcel.delivered.sender'
   | 'notification.trip.created.driver'
   | 'notification.trip.updated.driver'
   | 'notification.trip.updated.passenger'
   | 'notification.trip.started.passenger'
   | 'notification.trip.started.driver'
   | 'notification.trip.completed.passenger'
   | 'notification.trip.completed.driver'
   | 'notification.trip.cancelled.passenger'
   | 'notification.trip.cancelled.driver'
   | 'notification.trip.driver_cancelled.booking_refunded'
   | 'notification.trip.driver_cancelled.pending_booking'
   | 'notification.payment.wallet_deposit'
   | 'notification.payment.wallet_deposit_failed'
   | 'notification.payment.success'
   | 'notification.payment.failed'
   | 'notification.wallet.negative_balance.driver'
   | 'notification.rating.given'
   | 'notification.rating.received'
   | 'notification.search.new_trips'
   | 'notification.driver.create_trip_reminder_1d'
   | 'notification.driver.create_trip_reminder_3d'
   | 'notification.driver.create_trip_reminder_6d'
   | 'notification.user.inactive_5d'
   | 'notification.user.inactive_10d'
   | 'notification.user.inactive_20d'
   | 'notification.new_message'
   | 'notification.test.server_heartbeat'
   | 'notification.test.action';

// Title keys
export type TitleKeys =
   | 'title.booking.confirmed'
   | 'title.booking.cancelled'
   | 'title.booking.updated'
   | 'title.booking.new_passenger'
   | 'title.booking.day_reminder'
   | 'title.parcel.new_request'
   | 'title.parcel.confirmed'
   | 'title.parcel.rejected'
   | 'title.parcel.cancelled'
   | 'title.parcel.picked_up'
   | 'title.parcel.delivered'
   | 'title.trip.created'
   | 'title.trip.updated'
   | 'title.trip.started'
   | 'title.trip.completed'
   | 'title.trip.cancelled'
   | 'title.payment.wallet'
   | 'title.payment.booking'
   | 'title.rating'
   | 'title.search.new_trips'
   | 'title.driver.create_trip'
   | 'title.user.comeback'
   | 'title.wallet.negative_balance'
   | 'title.new_message'
   | 'title.test.server_heartbeat'
   | 'title.test.action';

// Error keys
export type ErrorKeys =
   | 'error.trip.not_found'
   | 'error.booking.failed'
   | 'error.unauthorized'
   | 'error.forbidden';

// General keys
export type GeneralKeys = 'general.welcome' | 'general.thank_you';

// All translation keys combined
export type TranslationKey =
   | NotificationKeys
   | TitleKeys
   | ErrorKeys
   | GeneralKeys;

/**
 * Parameters for each translation key
 * This ensures you pass the correct parameters when using translations
 */
export interface TranslationParams {
   'notification.booking.created.passenger': {
      seatsBooked: string | number;
      totalPrice: string | number;
   };
   'notification.booking.created.driver': { seatsBooked: string | number };
   'notification.booking.confirmed.passenger': {
      seatsBooked: string | number;
      totalPrice: string | number;
   };
   'notification.booking.cancelled.passenger': {
      cancellationReason: string | number;
   };
   'notification.booking.updated.passenger': {
      seatsDifference: string | number;
   };
   'notification.booking.updated.driver': { seatChangeText: string | number };
   'notification.booking.day_reminder': {
      fromCity: string | number;
      toCity: string | number;
      departureTime: string | number;
   };
   'notification.parcel.created.sender': {
      fromCity: string | number;
      toCity: string | number;
      price: number;
   };
   'notification.parcel.created.driver': {
      fromCity: string | number;
      toCity: string | number;
   };
   'notification.parcel.confirmed.sender': { price: number };
   'notification.parcel.rejected.sender': { reason: string | number };
   'notification.parcel.cancelled.sender': {
      cancellationReason: string | number;
   };
   'notification.trip.updated.passenger': {
      fromAddress: string | number;
      toAddress: string | number;
   };
   'notification.trip.started.passenger': {
      fromCity: string | number;
      toCity: string | number;
   };
   'notification.trip.started.driver': {
      fromCity: string | number;
      toCity: string | number;
   };
   'notification.trip.completed.passenger': {
      fromCity: string | number;
      toCity: string | number;
   };
   'notification.trip.completed.driver': {
      fromCity: string | number;
      toCity: string | number;
   };
   'notification.trip.cancelled.passenger': {
      fromCity: string | number;
      toCity: string | number;
   };
   'notification.trip.cancelled.driver': {
      fromCity: string | number;
      toCity: string | number;
   };
   'notification.payment.wallet_deposit': { amount: number };
   'notification.payment.wallet_deposit_failed': { amount: number };
   'notification.payment.success': { amount: number };
   'notification.wallet.negative_balance.driver': { balance: number };
   'notification.rating.given': { driverName: string | number; rating: number };
   'notification.rating.received': {
      passengerName: string | number;
      rating: number;
   };
   'notification.search.new_trips': {
      tripCount: string | number;
      fromCity: string | number;
      toCity: string | number;
   };
   'notification.new_message': {
      senderName: string | number;
      content: string | number;
   };
   'notification.test.server_heartbeat': { time: string | number };
   'notification.test.action': {
      action: string | number;
      time: string | number;
   };
}

// Keys that don't require parameters
export type TranslationKeyWithoutParams = Exclude<
   TranslationKey,
   keyof TranslationParams
>;

// Keys that require parameters
export type TranslationKeyWithParams = keyof TranslationParams;
