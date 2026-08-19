import axios from 'axios';
import logger from '../../../shared/utils/logger';

const MODERATOR_URL =
   process.env.MODERATOR_URL || 'http://192.168.1.69:8000/moderate/omni-gpt';
const API_KEY = process.env.MODERATOR_API_KEY || 'your-secret';
const MODERATION_ENABLED = process.env.ENABLE_MODERATION !== 'false'; // По умолчанию включено

export async function checkModeration(text) {
   if (!MODERATION_ENABLED) {
      return { flagged: false, reason: 'moderation disabled' };
   }

   try {
      const res = await axios.post(
         MODERATOR_URL,
         { message: text }, // fastapi ждёт message, не text
         {
            headers: {
               'Content-Type': 'application/json',
               'x-api-key': API_KEY,
            },
            timeout: 5000, // 5 секунд: сервис модерации отвечает медленно
         },
      );

      return res.data;
      // { flagged: true/false, message: "...", reason?: "" }
   } catch (err) {
      // Тихо логируем только если это не timeout (чтобы не спамить)
      if (err.code !== 'ECONNABORTED') {
         logger.error({ err }, 'Moderation error');
      }

      // если модератор умер — пропускаем сообщение (не блокируем UX)
      return {
         flagged: false,
         reason: 'moderation service unavailable',
      };
   }
}
