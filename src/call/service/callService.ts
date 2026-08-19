import * as userRepository from '../../user/repository/userRepository';
import { sendPushNotification } from '../../../shared/utils/fcmService';
import { sendVoipPush } from '../../../shared/utils/apnsVoip';
import logger from '../../../shared/utils/logger';
import { IncomingCallPushInput } from '../models/dto/callValidation';

/**
 * Разбудить callee при входящем звонке. Вызывается Go callService, когда
 * получатель оффлайн на всех WS-инстансах.
 *
 * iOS дозванивается ТОЛЬКО через APNs VoIP-push (PushKit → CallKit) — FCM это
 * сделать не может. Android поднимает звонок через FCM high-priority data-push.
 * Токены лежат прямо в users: voip_token (iOS) + fcm_token (обе платформы) —
 * одно устройство на юзера, как и fcm_token. См. audit/notify/VOIP_IOS_ARCHITECTURE.md.
 */
export const SendIncomingCallPush = async (
   input: IncomingCallPushInput,
): Promise<void> => {
   const caller = await userRepository.findUserNameById(input.caller_id);
   const callerName = caller
      ? [caller.firstName, caller.lastName].filter(Boolean).join(' ').trim()
      : '';

   const callee = await userRepository.findUserPushTokensById(input.callee_id);

   if (!callee) {
      logger.info(
         { calleeId: input.callee_id, callId: input.call_id },
         'incoming call push skipped: callee not found',
      );
      return;
   }

   // sendPushNotification принимает { title, body, [key]: string } — все доп.
   // поля должны быть строками.
   const fcmPayload = {
      title: 'Входящий звонок',
      body: callerName ? `Вам звонит ${callerName}` : 'Входящий звонок',
      type: 'incoming_call',
      callId: input.call_id,
      callerId: input.caller_id,
      callerName,
   };

   // iOS с VoIP-токеном — единственный путь, который реально звонит на iPhone.
   if (callee.voipToken) {
      const res = await sendVoipPush(callee.voipToken, {
         call_id: input.call_id,
         caller_id: input.caller_id,
         caller_name: callerName,
      });

      if (res.ok) {
         logger.info(
            { calleeId: input.callee_id, callId: input.call_id },
            'incoming call push sent via APNs VoIP',
         );
         return;
      }

      // Токен протух (приложение удалено/перерегистрировано) — чистим, чтобы не
      // долбить APNs мёртвым токеном.
      if (res.invalidToken) {
         callee.voipToken = null;
         await userRepository.saveUser(callee);
         logger.info(
            { calleeId: input.callee_id, callId: input.call_id },
            'cleared invalid voip token',
         );
      }
      // VoIP не настроен / временная ошибка / токен протух — деградируем на
      // FCM-баннер ниже (на iOS это не звонок, но хоть уведомление).
   }

   // Android (или iOS без живого voip_token) — FCM.
   if (callee.fcmToken) {
      await sendPushNotification(callee.fcmToken, fcmPayload);
      logger.info(
         { calleeId: input.callee_id, callId: input.call_id },
         'incoming call push sent via FCM',
      );
      return;
   }

   logger.info(
      { calleeId: input.callee_id, callId: input.call_id },
      'incoming call push skipped: no usable push token',
   );
};
