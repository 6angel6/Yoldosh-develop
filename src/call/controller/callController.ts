import { Request, Response } from 'express';
import * as callService from '../service/callService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import { incomingCallPushSchema } from '../models/dto/callValidation';
import { SendIncomingCallPush } from '../service/callService';

/**
 * POST /api/v1/internal/call/push — внутренний эндпойнт для Go callService.
 * Принимает {callee_id, call_id, caller_id} и шлёт callee VoIP-push.
 */
export const incomingCallPush = async (req: Request, res: Response) => {
   try {
      const data = incomingCallPushSchema.parse(req.body);
      await callService.SendIncomingCallPush(data);
      return apiResponse.success(res, null, 'Push processed.', 202);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'incomingCallPush',
            calleeId: req.body?.callee_id,
            callId: req.body?.call_id,
         },
         'Failed to process incoming call push.',
      );
   }
};
