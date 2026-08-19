import express from 'express';

import { auth, authForSearch } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/config/lib';
import { checkBan } from '../../shared/middleware/checkBan';
import { optimizeImage, uploadAvatar } from '../../shared/middleware/upload';
import { trackTestUserActions } from '../../shared/middleware/testUserTracking';

import * as userController from './controller/userController';
import * as reportController from './controller/reportController';
import * as searchController from '../user/controller/searchController';
import * as promocodeController from '../promocode/controller/promocodeController';

import { SessionTracker } from '../../shared/middleware/sessionTracker';

const router = express.Router();

router.get('/me', auth, asyncHandler(userController.getMe));
router.get(
   '/me/profile',
   auth,
   trackTestUserActions('profile.view'),
   asyncHandler(userController.getUserProfile),
);
router.patch('/me/profile', auth, asyncHandler(userController.updateProfile));

router.put(
   '/avatar',
   auth,
   uploadAvatar,
   optimizeImage,
   asyncHandler(userController.updateAvatar),
);

router.delete('/avatar', auth, asyncHandler(userController.deleteAvatar));
router.delete('/account', auth, asyncHandler(userController.deleteAccount));
router.delete(
   '/delete-by-phone',
   auth,
   asyncHandler(userController.deleteUserByPhone),
);

// Регистрация push-токенов: fcmToken (обе платформы) + voipToken/platform (iOS,
// для CallKit-звонков). Хранятся прямо в users.
router.post('/fcm-token', auth, asyncHandler(userController.updateFcmToken));

router.get(
   '/search-history',
   authForSearch,
   SessionTracker,
   asyncHandler(searchController.getSearchHistory),
);

router.post('/block-user', auth, asyncHandler(userController.blockUser));
router.post('/unblock-user', auth, asyncHandler(userController.unblockUser));
router.get(
   '/blocked-users',
   auth,
   asyncHandler(userController.getBlockedUsers),
);

router.get('/:id', asyncHandler(userController.getUserById));

router.post(
   '/:userId/report',
   auth,
   checkBan,
   asyncHandler(reportController.createUserReport),
);

router.get(
   '/me/promocodes',
   auth,
   asyncHandler(promocodeController.getMyPromoCode),
);
router.post(
   '/me/promocodes/activate',
   auth,
   checkBan,
   asyncHandler(promocodeController.activatePromoCode),
);

export default router;
