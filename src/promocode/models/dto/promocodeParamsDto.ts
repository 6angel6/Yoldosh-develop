import { z } from 'zod';

/** `:promoCodeId` в пути удаления промокода. */
export const promoCodeIdParamsSchema = z.object({
   promoCodeId: z.uuid({
      message: 'Invalid promo code ID format (UUID expected).',
   }),
});
