import { z } from 'zod';

/**
 * Тело внутреннего запроса от Go callService, когда callee оффлайн и нужен
 * VoIP-push, чтобы разбудить телефон. Контракт (snake_case) задан Go-стороной:
 * internal/push/bff/client.go.
 */
export const incomingCallPushSchema = z.object({
   callee_id: z.uuid('callee_id must be a UUID'),
   call_id: z.uuid('call_id must be a UUID'),
   caller_id: z.uuid('caller_id must be a UUID'),
});

export type IncomingCallPushInput = z.infer<typeof incomingCallPushSchema>;
