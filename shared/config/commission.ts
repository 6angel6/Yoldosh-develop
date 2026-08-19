export const COMMISSION_CONFIG = {
   TRIP_COMMISSION_PERCENTAGE: 0,
   MIN_DRIVER_BALANCE: -50000, // -50,000 сум
};

export const calculateCommission = (totalTripAmount: number): number => {
   const commissionAmount =
      (totalTripAmount * COMMISSION_CONFIG.TRIP_COMMISSION_PERCENTAGE) / 100;

   return Math.round(commissionAmount * 100) / 100;
};
