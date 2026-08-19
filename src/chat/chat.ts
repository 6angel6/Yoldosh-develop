import express from 'express';
import { auth } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/config/lib';
import { checkBan } from '../../shared/middleware/checkBan';
import { trackTestUserActions } from '../../shared/middleware/testUserTracking';
import * as chatController from '../chat/controller/chatController';
import { uploadMedia } from '../../shared/middleware/upload';

const router = express.Router();

router.get(
   '/',
   auth,
   trackTestUserActions('chat.open'),
   asyncHandler(chatController.getMyChats),
);
router.post('/', auth, checkBan, asyncHandler(chatController.startChat));
router.get('/:chatId/messages', auth, asyncHandler(chatController.getMessages));
router.post(
   '/:chatId/messages',
   auth,
   checkBan,
   uploadMedia,
   asyncHandler(chatController.postMessage),
);

export default router;
