import db from '../config/database';
import logger from '../utils/logger';
import Trip, { TripStatus } from '../../src/trips/models/Trip';
import Car from '../../src/car/model/Car';
import User, { UserRole } from '../../src/user/models/User';
import Booking, { BookingStatus } from '../../src/booking/models/Booking';
import { Op, Transaction } from 'sequelize';
import Wallet from '../../src/payment/models/Wallet';

// Extensive addresses in Uzbekistan for geocoding - Multiple points per city
const UZB_ADDRESSES = [
   // TASHKENT (Capital - ~50 locations)
   'Tashkent International Airport, Tashkent, Uzbekistan',
   'North Railway Station, Tashkent, Uzbekistan',
   'Amir Temur Square, Tashkent, Uzbekistan',
   'Chorsu Bazaar, Tashkent, Uzbekistan',
   'Tashkent Tower, Tashkent, Uzbekistan',
   'Magic City Park, Tashkent, Uzbekistan',
   'National Park, Tashkent, Uzbekistan',
   'Alisher Navoi Opera Theater, Tashkent, Uzbekistan',
   'Tashkent Metro Alisher Navoi, Tashkent, Uzbekistan',
   'Mega Planet Shopping Mall, Tashkent, Uzbekistan',
   'Next Shopping Center, Tashkent, Uzbekistan',
   'Samarkand Darvoza Shopping Center, Tashkent, Uzbekistan',
   'Alay Bazaar, Tashkent, Uzbekistan',
   'Yunusobod District Center, Tashkent, Uzbekistan',
   'Chilanzar District Center, Tashkent, Uzbekistan',
   'Sergeli District Center, Tashkent, Uzbekistan',
   'Mirzo Ulugbek University, Tashkent, Uzbekistan',
   'Tashkent State University, Tashkent, Uzbekistan',
   'Minor Mosque, Tashkent, Uzbekistan',
   'Hazrati Imam Complex, Tashkent, Uzbekistan',
   'Independence Square, Tashkent, Uzbekistan',
   'Tashkent City Park, Tashkent, Uzbekistan',
   'Lotte City Hotel, Tashkent, Uzbekistan',
   'Hyatt Regency Tashkent, Tashkent, Uzbekistan',
   'Tashkent Palace Hotel, Tashkent, Uzbekistan',

   // SAMARKAND (~30 locations)
   'Registan Square, Samarkand, Uzbekistan',
   'Samarkand Railway Station, Samarkand, Uzbekistan',
   'Gur-e-Amir Mausoleum, Samarkand, Uzbekistan',
   'Shah-i-Zinda Necropolis, Samarkand, Uzbekistan',
   'Bibi-Khanym Mosque, Samarkand, Uzbekistan',
   'Siab Bazaar, Samarkand, Uzbekistan',
   'Ulugh Beg Observatory, Samarkand, Uzbekistan',
   'Afrasiyab Museum, Samarkand, Uzbekistan',
   'Samarkand International Airport, Samarkand, Uzbekistan',
   'Registon Shopping Center, Samarkand, Uzbekistan',
   'Samarkand State University, Samarkand, Uzbekistan',
   'Dinamo Stadium, Samarkand, Uzbekistan',
   'Samarkand City Park, Samarkand, Uzbekistan',
   'Hazrat Khizr Mosque, Samarkand, Uzbekistan',
   'Daniel Mausoleum, Samarkand, Uzbekistan',

   // BUKHARA (~25 locations)
   'Lyabi-Hauz Ensemble, Bukhara, Uzbekistan',
   'Ark Fortress, Bukhara, Uzbekistan',
   'Bukhara Railway Station, Bukhara, Uzbekistan',
   'Kalyan Minaret, Bukhara, Uzbekistan',
   'Chor-Minor Madrasah, Bukhara, Uzbekistan',
   'Bukhara International Airport, Bukhara, Uzbekistan',
   'Bolo Hauz Mosque, Bukhara, Uzbekistan',
   'Trading Domes, Bukhara, Uzbekistan',
   'Samanid Mausoleum, Bukhara, Uzbekistan',
   'Sitorai Mokhi-Khosa Palace, Bukhara, Uzbekistan',
   'Bukhara Central Park, Bukhara, Uzbekistan',
   'Bukhara State University, Bukhara, Uzbekistan',

   // KHIVA (~15 locations)
   'Itchan Kala West Gate, Khiva, Uzbekistan',
   'Kalta Minor Minaret, Khiva, Uzbekistan',
   'Khiva Bus Station, Khiva, Uzbekistan',
   'Kunya-Ark Citadel, Khiva, Uzbekistan',
   'Islam Khodja Minaret, Khiva, Uzbekistan',
   'Tash Hauli Palace, Khiva, Uzbekistan',
   'Juma Mosque, Khiva, Uzbekistan',
   'Pakhlavan Mahmud Mausoleum, Khiva, Uzbekistan',

   // FERGANA (~20 locations)
   'Fergana Regional Museum, Fergana, Uzbekistan',
   'Fergana Railway Station, Fergana, Uzbekistan',
   'Fergana International Airport, Fergana, Uzbekistan',
   'Fergana Central Park, Fergana, Uzbekistan',
   'Fergana State University, Fergana, Uzbekistan',
   'Fergana Bazaar, Fergana, Uzbekistan',
   'Margilan City Center, Margilan, Fergana, Uzbekistan',
   'Kokand Palace, Kokand, Fergana, Uzbekistan',
   'Kokand Railway Station, Kokand, Fergana, Uzbekistan',
   'Rishtan Ceramics Workshop, Rishtan, Fergana, Uzbekistan',

   // NAMANGAN (~20 locations)
   'Namangan Central Park, Namangan, Uzbekistan',
   'Namangan Railway Station, Namangan, Uzbekistan',
   'Namangan Airport, Namangan, Uzbekistan',
   'Namangan State University, Namangan, Uzbekistan',
   'Namangan City Center, Namangan, Uzbekistan',
   'Mulla Kyrgyz Madrasah, Namangan, Uzbekistan',
   'Ota Valikhon Tur Mosque, Namangan, Uzbekistan',
   'Namangan Bazaar, Namangan, Uzbekistan',

   // ANDIJAN (~20 locations)
   'Andijan Railway Station, Andijan, Uzbekistan',
   'Jami Mosque, Andijan, Uzbekistan',
   'Andijan Regional Museum, Andijan, Uzbekistan',
   'Babur Park, Andijan, Uzbekistan',
   'Andijan State University, Andijan, Uzbekistan',
   'Andijan Central Bazaar, Andijan, Uzbekistan',
   'Andijan Airport, Andijan, Uzbekistan',

   // NUKUS (~15 locations)
   'Savitsky Museum, Nukus, Uzbekistan',
   'Nukus Railway Station, Nukus, Uzbekistan',
   'Nukus Airport, Nukus, Uzbekistan',
   'Nukus Central Park, Nukus, Uzbekistan',
   'Karakalpakstan State Museum, Nukus, Uzbekistan',
   'Nukus Bazaar, Nukus, Uzbekistan',

   // QARSHI (~15 locations)
   'Qarshi Railway Station, Qarshi, Uzbekistan',
   'Qarshi Airport, Qarshi, Uzbekistan',
   'Qarshi City Center, Qarshi, Uzbekistan',
   'Kok Gumbaz Mosque, Qarshi, Uzbekistan',
   'Qarshi State University, Qarshi, Uzbekistan',

   // TERMEZ (~15 locations)
   'Termez Railway Station, Termez, Uzbekistan',
   'Termez Airport, Termez, Uzbekistan',
   'Sultan Saodat Complex, Termez, Uzbekistan',
   'Fayaz Tepe, Termez, Uzbekistan',
   'Termez Archaeological Museum, Termez, Uzbekistan',
   'Termez City Center, Termez, Uzbekistan',

   // URGENCH (~15 locations)
   'Urgench International Airport, Urgench, Uzbekistan',
   'Urgench Railway Station, Urgench, Uzbekistan',
   'Urgench City Center, Urgench, Uzbekistan',
   'Urgench Bazaar, Urgench, Uzbekistan',
   'Al-Khorezmi Monument, Urgench, Uzbekistan',

   // JIZZAKH (~10 locations)
   'Jizzakh Railway Station, Jizzakh, Uzbekistan',
   'Jizzakh City Center, Jizzakh, Uzbekistan',
   'Jizzakh Regional Museum, Jizzakh, Uzbekistan',
   'Jizzakh Bazaar, Jizzakh, Uzbekistan',

   // GULISTAN (~10 locations)
   'Gulistan Railway Station, Gulistan, Uzbekistan',
   'Gulistan City Center, Gulistan, Uzbekistan',
   'Gulistan Central Park, Gulistan, Uzbekistan',

   // ZARAFSHAN (~10 locations)
   'Zarafshan City Center, Zarafshan, Uzbekistan',
   'Zarafshan Gold Mining Complex, Zarafshan, Uzbekistan',

   // CHIRCHIQ (~10 locations)
   'Chirchiq Railway Station, Chirchiq, Uzbekistan',
   'Chirchiq City Center, Chirchiq, Uzbekistan',
   'Chirchiq Hydroelectric Plant, Chirchiq, Uzbekistan',
];

interface GeocodedLocation {
   city: string;
   address: string;
   lat: number;
   lon: number;
}

let REAL_CITIES: GeocodedLocation[] = [];

const MOCK_CAR_MODELS = [
   { make: 'Chevrolet', model: 'Lacetti' },
   { make: 'Chevrolet', model: 'Cobalt' },
   { make: 'Chevrolet', model: 'Nexia 3' },
   { make: 'Chevrolet', model: 'Spark' },
   { make: 'Chevrolet', model: 'Tracker' },
   { make: 'Chevrolet', model: 'Malibu' },
   { make: 'Chevrolet', model: 'Damas' },
   { make: 'Kia', model: 'Sonet' },
   { make: 'Daewoo', model: 'Matiz' },
   { make: 'Hyundai', model: 'Accent' },
];

const MOCK_COLORS = [
   'Black',
   'White',
   'Gray',
   'Silver',
   'Blue',
   'Red',
   'Green',
];

const PASSENGER_FIRST_NAMES = [
   'Soliha',
   'Muslima',
   'Yasmina',
   'Hadicha',
   'Iroda',
   'Narina',
   'Gulnoza',
   'Feruza',
   'Dilfuza',
   'Mavlyuda',
   'Ozoda',
   'Sevara',
   'Anora',
   'Nafisa',
   'Shodiya',
   'Malika',
   'Shahida',
   'Farida',
   'Khushuma',
   'Botakoz',
];
const DRIVER_FIRST_NAMES = [
   'Rustam',
   'Aziz',
   'Timur',
   'Bekzod',
   'Javlon',
   'Alisher',
   'Bakhtiyar',
   'Dilshod',
   'Farhod',
   'Gulom',
   'Habibullo',
   'Ilkham',
   'Jamshid',
   'Khodji',
   'Lazizbek',
   'Mansur',
   'Navruzbek',
   'Oybek',
   'Parviz',
   'Rakhmat',
   'Sadulla',
   'Sherzod',
   'Ulugbek',
   'Valentin',
   'Yodgor',
   'Zaur',
];
const LAST_NAMES = [
   'Karimova',
   'Uzbekov',
   'Rahimova',
   'Nigmatov',
   'Sultanova',
   'Abdullayev',
   'Alsayed',
   'Aminov',
   'Aydarov',
   'Babaev',
   'Bezarbokov',
   'Boboev',
   'Bokiev',
   'Boymuradov',
   'Bozorov',
   'Chaptanov',
   'Darpanov',
   'Davletmuratov',
   'Davlyatov',
   'Davronov',
   'Ergashev',
   'Eshankulov',
   'Faiziyev',
   'Farhodov',
   'Galiev',
   'Ganibekov',
   'Ganiev',
   'Gapparov',
   'Garifullin',
   'Gaybullaev',
   'Gaziyev',
   'Ghuliev',
   'Gidiyatov',
   'Giduanov',
   'Glushkov',
   'Gulamov',
   'Guliev',
   'Gulomov',
   'Guluev',
   'Gumenuk',
];

/**
 * Geocode addresses using Nominatim (OpenStreetMap)
 */
async function geocodeAddresses(): Promise<GeocodedLocation[]> {
   logger.info('Geocoding addresses via Nominatim...');
   const locations: GeocodedLocation[] = [];

   for (const address of UZB_ADDRESSES) {
      try {
         const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;

         const response = await fetch(url, {
            headers: {
               'User-Agent': 'Yoldosh-Seed-Script/1.0',
            },
         });

         if (!response.ok) {
            logger.warn(`Failed to geocode: ${address}`);
            continue;
         }

         const data = await response.json();

         if (data && data.length > 0) {
            const result = data[0];
            const cityMatch = address.match(/,\s*([^,]+),\s*Uzbekistan/);
            const city = cityMatch ? cityMatch[1].trim() : 'Unknown';

            locations.push({
               city,
               address: address.replace(', Uzbekistan', ''),
               lat: parseFloat(result.lat),
               lon: parseFloat(result.lon),
            });

            logger.info(`Geocoded: ${city} - ${result.lat}, ${result.lon}`);
         } else {
            logger.warn(`No results for: ${address}`);
         }

         // Respect Nominatim rate limit (1 request per second)
         await new Promise((resolve) => setTimeout(resolve, 1100));
      } catch (error) {
         logger.error({ err: error, address }, 'Geocoding error');
      }
   }

   logger.info(`Geocoded ${locations.length} locations`);
   return locations;
}

const generateUniquePhone = (operatorCode: string): string => {
   const randomDigits = Math.floor(
      1000000 + Math.random() * 9000000,
   ).toString();
   return `+998${operatorCode}${randomDigits}`;
};

const generateGovNumber = (index: number): string => {
   const region = String(Math.floor(Math.random() * 10) + 1).padStart(2, '0');
   const letters =
      String.fromCharCode(65 + (index % 26)) +
      String.fromCharCode(65 + ((index + 1) % 26));
   const digits = String(Math.floor(100 + Math.random() * 899));
   return `${region} ${letters.toUpperCase()} ${digits} ${letters.toUpperCase()}`;
};

const generatePastDate = (yearsAgo: number): Date => {
   const now = new Date();
   now.setFullYear(now.getFullYear() - yearsAgo);
   now.setDate(Math.floor(Math.random() * 28) + 1);
   now.setMonth(Math.floor(Math.random() * 12));
   return now;
};

async function createTestUsers(t: Transaction) {
   logger.info('Seeding users: Super Driver + Randoms...');
   const usersToCreate = [];
   const genders = ['MALE', 'FEMALE'];
   const navigators = ['YANDEX_NAVI', 'GOOGLE_MAPS', 'NONE'];
   const languages = ['uz', 'ru', 'en'];
   const passengerBios = [
      'Любитель путешествий',
      'Студент',
      'Деловой путешественник',
      'Регулярный пассажир',
      'Молодой специалист',
      'Фрилансер',
      'Учитель',
      'Врач',
      'Инженер',
      'Предприниматель',
   ];
   const driverBios = [
      'Опытный водитель, 10+ лет',
      'Внимательный и вежливый',
      'Чистый автомобиль, всё успеваю',
      'Безопасное вождение - приоритет',
      'Профессиональный водитель такси',
      'Быстрая доставка, честные цены',
      'Любу и маршруты, помогу советом',
      'Музыка в дороге, благодарю за поездку',
      'Никаких спешек, едим по правилам',
      'Всегда вовремя, качественный сервис',
   ];

   const superDriverPhone = '+998000000000';
   usersToCreate.push({
      where: { phoneNumber: superDriverPhone },
      defaults: {
         firstName: 'Алишер',
         lastName: 'Гуломов',
         phoneNumber: superDriverPhone,
         role: UserRole.Driver,
         verified: true,
         gender: 'MALE',
         bio: 'Главный тестовый водитель приложения',
         rating: 4.9,
         talkative: true,
         music_allowed: true,
         pets_allowed: true,
         preferred_navigator: 'YANDEX_NAVI',
         preferredLanguage: 'uz',
         passport_verified: true,
      },
   });

   for (let i = 0; i < 50; i++) {
      const firstName =
         PASSENGER_FIRST_NAMES[
            Math.floor(Math.random() * PASSENGER_FIRST_NAMES.length)
         ];
      const lastName =
         LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const phone = generateUniquePhone('90');
      const birthYear = 1985 + Math.floor(Math.random() * 35);

      usersToCreate.push({
         where: { phoneNumber: phone },
         defaults: {
            firstName,
            lastName,
            phoneNumber: phone,
            role: UserRole.Passenger,
            verified: true,
            gender: genders[Math.floor(Math.random() * genders.length)],
            bio: passengerBios[
               Math.floor(Math.random() * passengerBios.length)
            ],
            date_of__birthday: new Date(
               `${birthYear}-${Math.floor(Math.random() * 12) + 1}-${Math.floor(Math.random() * 28) + 1}`,
            ),
            rating: 4.3 + Math.random() * 0.7,
            preferred_navigator:
               navigators[Math.floor(Math.random() * navigators.length)],
            preferredLanguage:
               languages[Math.floor(Math.random() * languages.length)],
            talkative: Math.random() > 0.5,
            music_allowed: Math.random() > 0.3,
            pets_allowed: Math.random() > 0.6,
         },
      });
   }

   for (let i = 0; i < 100; i++) {
      const firstName =
         DRIVER_FIRST_NAMES[
            Math.floor(Math.random() * DRIVER_FIRST_NAMES.length)
         ];
      const lastName =
         LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const phone = generateUniquePhone('99');
      const birthYear = 1970 + Math.floor(Math.random() * 40);

      usersToCreate.push({
         where: { phoneNumber: phone },
         defaults: {
            firstName,
            lastName,
            phoneNumber: phone,
            role: 'Driver',
            verified: true,
            gender: 'MALE',
            bio: driverBios[Math.floor(Math.random() * driverBios.length)],
            date_of__birthday: new Date(
               `${birthYear}-${Math.floor(Math.random() * 12) + 1}-${Math.floor(Math.random() * 28) + 1}`,
            ),
            rating: 4.2 + Math.random() * 0.8,
            talkative: Math.random() > 0.4,
            music_allowed: Math.random() > 0.3,
            pets_allowed: Math.random() > 0.5,
            preferred_navigator:
               navigators[Math.floor(Math.random() * navigators.length)],
            preferredLanguage:
               languages[Math.floor(Math.random() * languages.length)],
            passport_verified: true,
         },
      });
   }

   const userPromises = usersToCreate.map((u) =>
      User.findOrCreate({ ...u, transaction: t }),
   );
   const createdUsers = (await Promise.all(userPromises)).map(([user]) => user);

   const drivers = createdUsers.filter((user) => user.role === UserRole.Driver);
   const walletPromises = drivers.map((driver) =>
      Wallet.findOrCreate({
         where: { userId: driver.id },
         defaults: { userId: driver.id, balance: 1000000 },
         transaction: t,
      }),
   );
   await Promise.all(walletPromises);

   return createdUsers;
}

async function createTestCars(drivers: User[], t: Transaction) {
   logger.info('Seeding cars...');
   const carData: any[] = [];
   let carIndex = 1;

   const driverIds = drivers.map((d) => d.id);

   await Car.destroy({
      where: { driver_id: { [Op.in]: driverIds } },
      transaction: t,
   });

   drivers.forEach((driver) => {
      const numCars = Math.random() > 0.5 ? 2 : 1;
      for (let i = 0; i < numCars; i++) {
         const carModel = MOCK_CAR_MODELS[carIndex % MOCK_CAR_MODELS.length];
         const color = MOCK_COLORS[carIndex % MOCK_COLORS.length];
         const seats = Math.random() > 0.3 ? 4 : 5; // 70% have 4 seats, 30% have 5

         carData.push({
            driver_id: driver.id,
            techPassportFrontPath: `/docs/techpassports/${driver.id}/front_${i}.jpg`,
            techPassportBackPath: `/docs/techpassports/${driver.id}/back_${i}.jpg`,
            govNumber: generateGovNumber(carIndex),
            make: carModel.make,
            model: carModel.model,
            color: color,
            issueDate: generatePastDate(3).toISOString().split('T')[0],
            techPassportSerial: `TX${Math.floor(10000 + Math.random() * 90000)}`,
            seats: seats,
            verified: true,
         });

         carIndex++;
      }
   });

   await Car.bulkCreate(carData, {
      transaction: t,
      ignoreDuplicates: true,
   });
}

async function createTestTrips(drivers: User[], t: Transaction) {
   logger.info('Seeding trips with real geodata...');
   const tripsToCreate = [];
   const NUM_TRIPS = 1200; // ~1000 active CREATED trips for testing

   const superDriver = drivers.find((d) => d.phoneNumber === '+998000000000');
   const allDrivers = [...drivers];

   for (let i = 0; i < NUM_TRIPS; i++) {
      let driver: User;

      // Ensure super driver has enough trips
      if (superDriver && i % 3 === 0) {
         driver = superDriver;
      } else {
         driver = allDrivers[i % allDrivers.length];
      }

      const cars = await Car.findAll({
         where: { driver_id: driver.id },
         transaction: t,
      });

      if (cars.length === 0) continue;
      const car = cars[i % cars.length];

      let departureTs: Date;
      let status = TripStatus.Created;
      let tripStartTs = null;
      let tripEndTs = null;

      const statusRoll = Math.random();

      if (statusRoll < 0.85) {
         // 85% CREATED (Future trips for testing real flow)
         const hoursAhead = Math.random() * 30 * 24; // 0-30 days
         departureTs = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
         status = TripStatus.Created;
      } else if (statusRoll < 0.9) {
         // 5% Completed (Past trips)
         departureTs = new Date(
            Date.now() - (Math.random() * 5 + 1) * 24 * 60 * 60 * 1000,
         );
         status = TripStatus.Completed;
         tripStartTs = new Date(departureTs.getTime() + 30 * 60 * 1000);
         tripEndTs = new Date(tripStartTs.getTime() + 2 * 60 * 60 * 1000);
      } else if (statusRoll < 0.95) {
         // 5% Canceled
         departureTs = new Date(
            Date.now() + Math.random() * 3 * 24 * 60 * 60 * 1000,
         );
         status = TripStatus.Canceled;
      } else {
         // 5% InProgress
         departureTs = new Date(Date.now() - 30 * 60 * 1000);
         status = TripStatus.InProgress;
         tripStartTs = departureTs;
      }

      const startLoc =
         REAL_CITIES[Math.floor(Math.random() * REAL_CITIES.length)];
      let endLoc = REAL_CITIES[Math.floor(Math.random() * REAL_CITIES.length)];

      while (
         endLoc.city === startLoc.city &&
         endLoc.address === startLoc.address
      ) {
         endLoc = REAL_CITIES[Math.floor(Math.random() * REAL_CITIES.length)];
      }

      const pricePerPerson = Math.floor(150000 + Math.random() * 100000);
      const seatsAvailable = Math.floor(1 + Math.random() * (car.seats - 1));

      // NO REGION IDs, using Cities and Lat/Lon directly
      tripsToCreate.push({
         driver_id: driver.id,
         car_id: car.id,

         from_city: startLoc.city,
         to_city: endLoc.city,

         from_latitude: startLoc.lat,
         from_longitude: startLoc.lon,
         to_latitude: endLoc.lat,
         to_longitude: endLoc.lon,

         from_address: startLoc.address,
         to_address: endLoc.address,

         departure_ts: departureTs,
         seats_available: seatsAvailable,
         price_per_person: pricePerPerson,
         max_two_back: Math.random() > 0.5,
         comment:
            Math.random() > 0.7
               ? `Trip to ${endLoc.city}, taking parcels too`
               : null,
         status,
         trip_start_ts: tripStartTs,
         trip_end_ts: tripEndTs,
         distance: Math.floor(Math.random() * 300) + 50,
         duration: Math.floor(Math.random() * 300) + 60,
      });
   }

   await Trip.destroy({
      where: { driver_id: { [Op.in]: drivers.map((d) => d.id) } },
      transaction: t,
   });

   return await Trip.bulkCreate(tripsToCreate, {
      transaction: t,
      ignoreDuplicates: true,
      returning: true,
   });
}

async function createTestBookings(
   trips: Trip[],
   passengers: User[],
   t: Transaction,
) {
   logger.info('Seeding bookings for trips...');
   const bookingsToCreate: any[] = [];

   const tripIds = trips.map((tr) => tr.id);
   await Booking.destroy({
      where: { tripId: { [Op.in]: tripIds } },
      transaction: t,
   });

   for (const trip of trips) {
      const car = await Car.findByPk(trip.car_id, { transaction: t });
      if (!car) continue;

      const totalSeats = car.seats;
      const availableSeats = trip.seats_available;
      const seatsToBook = totalSeats - availableSeats;

      if (seatsToBook <= 0) continue;

      let bookingStatus: BookingStatus;
      let cancellationReason: string | undefined = undefined;

      switch (trip.status) {
         case TripStatus.Completed:
            bookingStatus = BookingStatus.CONFIRMED;
            break;
         case TripStatus.InProgress:
            bookingStatus = BookingStatus.CONFIRMED;
            break;
         case TripStatus.Canceled:
            bookingStatus = BookingStatus.CANCELLED;
            cancellationReason = 'Driver canceled trip';
            break;
         case TripStatus.Created:
         default:
            bookingStatus = BookingStatus.CONFIRMED;
            break;
      }

      for (let k = 0; k < seatsToBook; k++) {
         const passenger =
            passengers[Math.floor(Math.random() * passengers.length)];

         bookingsToCreate.push({
            tripId: trip.id,
            passengerId: passenger.id,
            seatsBooked: 1,
            totalPrice: trip.price_per_person,

            pickup_latitude: trip.from_latitude,
            pickup_longitude: trip.from_longitude,
            dropoff_latitude: trip.to_latitude,
            dropoff_longitude: trip.to_longitude,

            from_city: trip.from_city,
            to_city: trip.to_city,
            from_address: trip.from_address,
            to_address: trip.to_address,

            status: bookingStatus,
            cancellationReason: cancellationReason,
         });
      }
   }

   await Booking.bulkCreate(bookingsToCreate, { transaction: t });
}

export const seedTestData = async () => {
   logger.info('Checking seed data requirements...');

   const t = await db.transaction();
   try {
      const superDriverCheck = await User.findOne({
         where: { phoneNumber: '+998000000000' },
         transaction: t,
      });

      if (superDriverCheck) {
         logger.info(
            'Test User (+998000000000) already exists. Skipping full seed.',
         );
         await t.rollback();
         return;
      }

      logger.info('Starting full seed process...');

      REAL_CITIES = await geocodeAddresses();

      if (REAL_CITIES.length === 0) {
         throw new Error(
            'Failed to geocode any addresses. Cannot proceed with seeding.',
         );
      }

      const users = await createTestUsers(t);
      const drivers = users.filter((u) => u.role === 'Driver');
      const passengers = users.filter((u) => u.role === 'Passenger');

      if (drivers.length > 0) {
         await createTestCars(drivers, t);
      }

      let createdTrips: Trip[] = [];
      if (drivers.length > 0) {
         createdTrips = await createTestTrips(drivers, t);
      }

      if (createdTrips.length > 0 && passengers.length > 0) {
         await createTestBookings(createdTrips, passengers, t);
      }

      await t.commit();
      logger.info(
         'Seeding completed! Use login: +998000000000 (code is usually fixed in dev)',
      );
   } catch (error) {
      await t.rollback();
      logger.error({ err: error }, 'Failed to seed test data');
   }
};
