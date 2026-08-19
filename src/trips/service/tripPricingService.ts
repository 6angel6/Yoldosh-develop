import * as tripRepository from '../repository/tripRepository';
import { cityTranslations } from '../../../shared/i18n/regionLocalization';

export const extractCityFromAddress = (address: string): string | null => {
   const tokens = address.split(',').map((t) => t.trim());

   for (const token of tokens) {
      const cleaned = token
         .replace(/\s+(shahar|shaxar|tumani|г\.?|город|city)$/i, '')
         .trim();

      if (cityTranslations[cleaned]) {
         return cleaned;
      }

      const lower = cleaned.toLowerCase();
      const match = Object.keys(cityTranslations).find(
         (k) => k.toLowerCase() === lower,
      );
      if (match) return match;
   }

   return null;
};

interface PriceRecommendation {
   recommended_min: number | null;
   recommended_max: number | null;
   average_price: number | null;
   trips_analyzed: number;
   confidence: 'high' | 'medium' | 'low' | 'insufficient_data';
}

const calculateConfidence = (
   count: number,
): 'high' | 'medium' | 'low' | 'insufficient_data' => {
   if (count >= 30) return 'high';
   if (count >= 10) return 'medium';
   if (count >= 5) return 'low';
   return 'insufficient_data';
};

const getPercentile = (sorted: number[], percentile: number): number => {
   if (sorted.length === 0) return 0;

   const index = (percentile / 100) * (sorted.length - 1);
   const lower = Math.floor(index);
   const upper = Math.ceil(index);

   if (lower === upper) return sorted[lower];

   const weight = index - lower;
   return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const roundToThousand = (value: number): number => {
   return Math.round(value / 1000) * 1000;
};

export const getPriceRecommendation = async (
   fromCity: string,
   toCity: string,
): Promise<
   PriceRecommendation & { from_city: string | null; to_city: string | null }
> => {
   const { rows: trips } = await tripRepository.findLast50CompletedTripsByCity(
      fromCity,
      toCity,
   );

   const tripsAnalyzed = trips.length;

   if (tripsAnalyzed < 5) {
      return {
         recommended_min: null,
         recommended_max: null,
         average_price: null,
         trips_analyzed: tripsAnalyzed,
         confidence: 'insufficient_data' as const,
         from_city: fromCity,
         to_city: toCity,
      };
   }

   const prices = trips
      .map((trip) => parseFloat(String(trip.price_per_person)))
      .sort((a, b) => a - b);

   const recommendedMin = getPercentile(prices, 15);
   const recommendedMax = getPercentile(prices, 85);
   const averagePrice =
      prices.reduce((sum, price) => sum + price, 0) / tripsAnalyzed;

   return {
      recommended_min: roundToThousand(recommendedMin),
      recommended_max: roundToThousand(recommendedMax),
      average_price: roundToThousand(averagePrice),
      trips_analyzed: tripsAnalyzed,
      confidence: calculateConfidence(tripsAnalyzed),
      from_city: fromCity,
      to_city: toCity,
   };
};

/**
 * Принимает полные адреса (как приходят с клиента / Яндекс.Карт),
 * извлекает название города из каждого адреса и передаёт в getPriceRecommendation.
 */
export const priceRecommendationByAddress = async (
   fromAddress: string,
   toAddress: string,
) => {
   const fromCity = extractCityFromAddress(fromAddress);
   const toCity = extractCityFromAddress(toAddress);

   if (!fromCity || !toCity) {
      return {
         recommended_min: null,
         recommended_max: null,
         average_price: null,
         trips_analyzed: 0,
         confidence: 'insufficient_data' as const,
         from_city: fromCity,
         to_city: toCity,
         error:
            !fromCity && !toCity
               ? 'Could not extract city from both addresses'
               : !fromCity
                 ? 'Could not extract city from from_address'
                 : 'Could not extract city from to_address',
      };
   }

   return getPriceRecommendation(fromCity, toCity);
};

export const priceRecommendationByCity = getPriceRecommendation;
