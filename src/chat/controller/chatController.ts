import { Request, Response } from 'express';
import logger from '../../../shared/utils/logger';
import * as chatService from '../service/chatService';
import * as apiResponse from '../../../shared/utils/apiResponse';
import { handleControllerError } from '../../../shared/utils/controllerErrorHandler';
import { chatIdParamsSchema } from '../dto/chatParamsDto';

export const getMyChats = async (req: Request, res: Response) => {
   try {
      const userId = req.user.id;
      const chats = await chatService.getUserChats(userId);
      return apiResponse.success(res, { chats });
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getMyChats',
            userId: req.user?.id,
         },
         'Failed to fetch your chats. Please try again.',
      );
   }
};

export const getMessages = async (req: Request, res: Response) => {
   try {
      const { chatId } = chatIdParamsSchema.parse(req.params);
      const userId = req.user.id;

      const data = await chatService.getChatMessages(chatId, userId);

      return apiResponse.success(res, data);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'getMessages',
            userId: req.user?.id,
            chatId: req.params.chatId,
         },
         'Failed to fetch messages. Please try again.',
      );
   }
};

export const postMessage = async (req: Request, res: Response) => {
   try {
      const senderId = req.user.id;
      const { chatId } = chatIdParamsSchema.parse(req.params);
      const { content, clientId } = req.body ?? {};
      const mediaFile = req.file;

      if (!content && !mediaFile) {
         return apiResponse.badRequest(
            res,
            'Message content or a media file is required.',
         );
      }

      const mediaUrl = mediaFile
         ? `/chat/media/${mediaFile.filename}`
         : undefined;

      const message = await chatService.sendMessage(
         chatId,
         senderId,
         content,
         mediaUrl,
         undefined, // req.user не содержит firstName, сервис использует 'User'
         // Кросс-транспортная идемпотентность: если клиент прислал clientId
         // (тот же, что и в WS `message.send`), REST-инсерт дедупится с WS.
         typeof clientId === 'string' ? clientId : undefined,
      );
      return apiResponse.success(res, { message }, 'Message sent', 201);
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'postMessage',
            userId: req.user?.id,
            chatId: req.params.chatId,
         },
         'Failed to send message. Please try again.',
      );
   }
};

export const startChat = async (req: Request, res: Response) => {
   try {
      const participant1Id = req.user.id;
      const { tripId, participant2Id } = req.body ?? {};

      if (!tripId || !participant2Id) {
         return apiResponse.badRequest(
            res,
            'tripId and participant2Id are required.',
         );
      }

      if (participant1Id === participant2Id) {
         return apiResponse.badRequest(
            res,
            "You can't start a chat with yourself.",
         );
      }

      const chat = await chatService.getOrCreateChat(
         tripId,
         participant1Id,
         participant2Id,
      );
      return apiResponse.success(
         res,
         { chat },
         'Chat started or retrieved',
         201,
      );
   } catch (error) {
      return handleControllerError(
         res,
         error,
         {
            operation: 'startChat',
            userId: req.user?.id,
            tripId: req.body?.tripId,
         },
         'Failed to start chat. Please try again.',
      );
   }
};
