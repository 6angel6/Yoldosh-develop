import { Trip } from '../models/Trip';
import PromoCode from '../../../src/promocode/models/PromoCode';
import { BookingStatus } from '../../booking/models/Booking';
import {
   COMMISSION_CONFIG,
   calculateCommission,
} from '../../../shared/config/commission';

export const formatBaseTrip = (tripJson: any) => {
   return {
      id: tripJson.id,
      departure_ts: tripJson.departure_ts,
      arrival_ts: tripJson.arrival_ts || null,
      seats_available: tripJson.seats_available,
      price_per_person: tripJson.price_per_person,
      max_two_back: tripJson.max_two_back || false,
      comment: tripJson.comment || null,
      booking_type: tripJson.booking_type,
      status: tripJson.status,
      // Trip Predictor: прогнозный трип помечается флагом; фронт рисует
      // «водитель обычно ездит в это время — уточните по телефону».
      is_predicted: tripJson.is_predicted ?? false,
      prediction_confidence:
         tripJson.prediction_confidence != null
            ? Number(tripJson.prediction_confidence)
            : null,
      trip_start_ts: tripJson.trip_start_ts || null,
      trip_end_ts: tripJson.trip_end_ts || null,
      createdAt: tripJson.created_at,
      conditioner: tripJson.conditioner || false,
      smoking_allowed: tripJson.smoking_allowed || false,
      door_pickup: tripJson.door_pickup || false,
      food_stop: tripJson.food_stop || false,
      garage: tripJson.garage || null,
      // Посылки (MVP): parcel_price = null → цена посылки равна price_per_person
      parcels_allowed: tripJson.parcels_allowed || false,
      parcel_price:
         tripJson.parcel_price != null ? Number(tripJson.parcel_price) : null,
      driver: tripJson.driver
         ? {
              id: tripJson.driver.id,
              firstName: tripJson.driver.firstName,
              lastName: tripJson.driver.lastName,
              avatar: tripJson.driver.avatar,
              phoneNumber: tripJson.driver.phoneNumber ?? null,
              rating: tripJson.driver.rating,
              rating_count: Number(tripJson.driver.ratingCount ?? 0),
              passport_verified: tripJson.driver.passport_verified,
              talkative: tripJson.driver.talkative ?? null,
              music_allowed: tripJson.driver.music_allowed ?? null,
              pets_allowed: tripJson.driver.pets_allowed ?? null,
           }
         : null,
      car: tripJson.car
         ? {
              id: tripJson.car.id,
              make: tripJson.car.make || tripJson.car.brand,
              model: tripJson.car.model,
              gov_number: tripJson.car.gov_number || tripJson.car.plateNumber,
              color: tripJson.car.color,
           }
         : null,
      duration: tripJson.duration || 0,
      distance: tripJson.distance || 0,
      booking_id: null as string | null,
      bookings: tripJson.bookings
         ? tripJson.bookings.map((booking: any) => ({
              id: booking.id,
              seatsBooked: booking.seatsBooked,
              status: booking.status,
              totalPrice: booking.totalPrice
                 ? parseFloat(String(booking.totalPrice))
                 : undefined,
              passenger: booking.passenger
                 ? {
                      id: booking.passenger.id,
                      firstName:
                         booking.passenger.firstName ||
                         booking.passenger.name?.split(' ')[0],
                      lastName:
                         booking.passenger.lastName ||
                         booking.passenger.name?.split(' ')[1],
                      gender: booking.passenger.gender || null,
                      avatar: booking.passenger.avatar || null,
                      rating: booking.passenger.rating || 0,
                   }
                 : null,
           }))
         : [],
      from_location: {
         address: tripJson.from_address,
         city: tripJson.from_city || '',
         coordinates: {
            longitude: parseFloat(String(tripJson.from_longitude)),
            latitude: parseFloat(String(tripJson.from_latitude)),
         },
      },
      to_location: {
         address: tripJson.to_address,
         city: tripJson.to_city || '',
         coordinates: {
            longitude: parseFloat(String(tripJson.to_longitude)),
            latitude: parseFloat(String(tripJson.to_latitude)),
         },
      },
   };
};

export const formatTripForPassenger = (
   trip: any,
   userPromoCode: any | null,
   userBooking?: any,
) => {
   const base = formatBaseTrip(trip);
   const originalPrice = parseFloat(String(trip.price_per_person || 0));

   let discountedPrice = originalPrice;
   let discountPercentage = 0;
   const hasActivePromo = !!(userPromoCode && userPromoCode.isActive);

   if (hasActivePromo) {
      discountPercentage = userPromoCode.discountPercentage;
      discountedPrice = Math.round(
         originalPrice * (1 - discountPercentage / 100),
      );
   }

   const seatsBookedByUser = userBooking?.seatsBooked || 0;
   const totalPriceByUser = userBooking?.totalPrice
      ? parseFloat(String(userBooking.totalPrice))
      : seatsBookedByUser * originalPrice;

   return {
      ...base,
      booking_id: userBooking?.id ?? null,
   };
};

export const formatTripForDriver = (trip: any) => {
   const base = formatBaseTrip(trip);
   const bookings = trip.bookings || [];
   const pricePerPerson = parseFloat(String(trip.price_per_person || 0));

   const totalConfirmedRevenue = bookings.reduce((sum: number, b: any) => {
      if (b.status === BookingStatus.CONFIRMED) {
         const bookingPrice = b.totalPrice
            ? parseFloat(String(b.totalPrice))
            : (b.seatsBooked || 0) * pricePerPerson;
         return sum + bookingPrice;
      }
      return sum;
   }, 0);

   const totalSeatsBooked = bookings.reduce((sum: number, b: any) => {
      return b.status === BookingStatus.CONFIRMED
         ? sum + (b.seatsBooked || 0)
         : sum;
   }, 0);

   const commissionAmount = calculateCommission(totalConfirmedRevenue);
   const commissionPercentage = COMMISSION_CONFIG.TRIP_COMMISSION_PERCENTAGE;
   const driverPayout = Math.max(totalConfirmedRevenue - commissionAmount, 0);

   return {
      ...base,
      driver_price: {
         total_bookings_price: totalConfirmedRevenue,
         price_per_person: pricePerPerson,
         total_seats_booked: totalSeatsBooked,
         commission: {
            percentage: commissionPercentage,
            amount: commissionAmount,
         },
         driver_payout: driverPayout,
         currency: 'UZS',
      },
   };
};

export const formatTripResponse = (
   trip: Trip,
   userPromoCode: PromoCode | null = null,
) => {
   const tripJson = (
      typeof (trip as any)?.toJSON === 'function'
         ? (trip as any).toJSON()
         : trip
   ) as any;
   const originalPrice = parseFloat(String(tripJson.price_per_person || 0));

   let discountedPrice = originalPrice; // без промокода = оригинальная цена за место
   let discountPercentage = 0;
   const hasActivePromo = !!(userPromoCode && userPromoCode.isActive);

   if (hasActivePromo && userPromoCode) {
      discountPercentage = userPromoCode.discountPercentage;
      discountedPrice = Math.round(
         originalPrice * (1 - discountPercentage / 100),
      );
   }

   const bookingsList = tripJson.bookings || [];
   const totalSeatsBooked = bookingsList.reduce(
      (acc: number, booking: any) => acc + Number(booking.seatsBooked || 0),
      0,
   );
   const totalBookingsPrice = totalSeatsBooked * originalPrice;

   const formattedBookings = bookingsList.map((booking: any) => ({
      ...booking,
      totalPrice: parseFloat(String(booking.totalPrice || 0)),
   }));

   const {
      from_latitude,
      from_longitude,
      from_address,
      to_latitude,
      to_longitude,
      to_address,
      from_geo,
      to_geo,
      distance,
      duration,
      bookings,
      from_city,
      to_city,
      // Trip Predictor: внутренние поля НЕ отдаём в API (контракт чистый) —
      // is_predicted/prediction_confidence добавляем ниже в нормализованном виде.
      source_trip_id,
      pattern_id,
      predicted_at,
      is_predicted,
      prediction_confidence,
      ...rest
   } = tripJson;

   return {
      ...rest,
      // Trip Predictor: единственные наружные поля фичи (аддитивно к старому
      // контракту; старые клиенты просто игнорируют неизвестные ключи).
      is_predicted: is_predicted ?? false,
      prediction_confidence:
         prediction_confidence != null ? Number(prediction_confidence) : null,
      duration: duration || 0,
      distance: distance || 0,
      bookings: formattedBookings,
      from_location: {
         address: from_address,
         city: from_city || '',
         coordinates: {
            longitude: parseFloat(String(from_longitude)),
            latitude: parseFloat(String(from_latitude)),
         },
      },
      to_location: {
         address: to_address,
         city: to_city || '',
         coordinates: {
            longitude: parseFloat(String(to_longitude)),
            latitude: parseFloat(String(to_latitude)),
         },
      },
      price: {
         total_bookings_price: totalBookingsPrice,
         price_per_person: originalPrice,
         final_price: discountedPrice, // цена за одно место с учётом скидки (или без)
         currency: 'UZS',
         promocode: {
            discounted: discountedPrice,
            discount_percentage: discountPercentage,
            has_active_promocode: hasActivePromo,
         },
      },
      total_seats_booked: totalSeatsBooked || 0,
   };
};

export const calculateTotalConfirmedPrice = (trip: any): number => {
   if (!trip.bookings || !Array.isArray(trip.bookings)) {
      return 0;
   }

   return trip.bookings.reduce((acc: number, booking: any) => {
      if (booking.status === BookingStatus.CONFIRMED) {
         return acc + parseFloat(String(booking.totalPrice || 0));
      }
      return acc;
   }, 0);
};
