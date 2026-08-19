import { Job } from 'bullmq';
import { NotificationPayload } from '../../queues/notificationQueue';
import { createNotification } from '../../../chat/service/notificationService';
import logger from '../../../../shared/utils/logger';

export async function processNotification(
   job: Job<NotificationPayload>,
): Promise<void> {
   const {
      source,
      eventType,
      recipientUserId,
      notificationType,
      translationKey,
      translationParams,
      titleTranslationKey,
      metadata,
   } = job.data;

   const result = await createNotification({
      userId: recipientUserId,
      type: notificationType,
      translationKey,
      translationParams,
      titleKey: titleTranslationKey,
      metadata,
   });

   if (!result) {
      logger.debug(
         {
            userId: recipientUserId,
            source,
            event: eventType,
            reason: 'preferences_or_not_found',
         },
         '[SKIP] Notification skipped',
      );
      return;
   }
}
