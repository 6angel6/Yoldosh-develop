import { z } from 'zod';
import { Request, Response } from 'express';

import { incomingDriverChatSchema } from '../dto/incomingDriverChatDto';
import { processIncomingDriverMessage } from '../service/internalDriverChatService';

import logger from '../../../shared/utils/logger';
import { AppError } from '../../../shared/utils/errorHandler';

export const incomingDriverMessage = async (req: Request, res: Response) => {
   let payload;
   try {
      payload = incomingDriverChatSchema.parse(req.body);
   } catch (err) {
      if (err instanceof z.ZodError) {
         const issue = err.issues[0];
         const field = issue?.path?.join('.') || 'payload';
         return res.status(400).json({
            ok: false,
            error: `${field}: ${issue?.message || 'invalid'}`,
         });
      }
      logger.error({ err }, '[CHAT_BRIDGE] unexpected validation error');
      return res.status(400).json({ ok: false, error: 'invalid payload' });
   }

   try {
      const result = await processIncomingDriverMessage(payload);
      return res.status(200).json({
         ok: true,
         chat_id: result.chatId,
         delivered_to_passenger: result.deliveredToPassenger,
      });
   } catch (err) {
      if (err instanceof AppError && err.statusCode === 400) {
         return res.status(400).json({ ok: false, error: err.message });
      }
      logger.error(
         {
            err,
            session: payload.sender_session,
            tg_user_id: payload.tg_user_id,
            tg_message_id: payload.tg_message_id,
            driver_phone: payload.driver_phone,
         },
         '[CHAT_BRIDGE] failed to process incoming message',
      );
      return res.status(500).json({ ok: false, error: 'internal error' });
   }
};
