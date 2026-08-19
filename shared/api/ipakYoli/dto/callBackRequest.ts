import { z } from 'zod';

export const contractCallbackSchema = z.object({
   contract_id: z.string(),
   client_id: z.string(),
   status: z.string(),
   card: z.object({
      pan_masked: z.string(),
      expiry: z.string(),
   }),
});

export const paymentCallbackSchema = z.object({
   tokenizedContractId: z.string(),
   status: z.string(),
   amount: z.number(),
   details: z.record(z.any().optional(), z.any()).optional(),
   orderId: z.string(),
   createdAt: z.string().optional(),
});

export const ipakCallbackSchema = z.union([
   contractCallbackSchema,
   paymentCallbackSchema,
]);

export type IpakCallbackDto = z.infer<typeof ipakCallbackSchema>;
