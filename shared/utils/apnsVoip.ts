import http2 from 'http2';
import jwt from 'jsonwebtoken';
import logger from './logger';

/**
 * Прямой APNs VoIP-push (PushKit) для iOS — то, что FCM отправить НЕ может.
 * Будит killed-приложение и обязывает его показать CallKit. Транспорт — HTTP/2
 * напрямую в APNs, авторизация — token-based (.p8, ES256 JWT). Нового npm-пакета
 * не требует: только встроенный http2 + jsonwebtoken.
 *
 * Конфиг через env (без них клиент работает как no-op — Android-путь не ломается):
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_KEY_P8, APNS_PRODUCTION
 * APNS_KEY_P8 — либо сырой PEM (с literal "\n"), либо base64 содержимого .p8.
 */

export interface VoipPushPayload {
   call_id: string;
   caller_id: string;
   caller_name: string;
}

export interface VoipPushResult {
   ok: boolean;
   /** Токен мёртв (приложение удалено/перерегистрировано) — строку устройства надо удалить. */
   invalidToken?: boolean;
   reason?: string;
}

const {
   APNS_KEY_ID,
   APNS_TEAM_ID,
   APNS_BUNDLE_ID,
   APNS_KEY_P8,
   APNS_PRODUCTION,
} = process.env;

export const isVoipConfigured = Boolean(
   APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID && APNS_KEY_P8,
);

const APNS_HOST =
   APNS_PRODUCTION === 'true'
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';

const REQUEST_TIMEOUT_MS = 5000;
// Звонок живёт недолго — просроченный APNs-push бесполезен.
const PUSH_TTL_SEC = 30;

function loadSigningKey(): string {
   const raw = APNS_KEY_P8 as string;
   if (raw.includes('BEGIN PRIVATE KEY')) {
      return raw.replace(/\\n/g, '\n');
   }
   return Buffer.from(raw, 'base64').toString('utf8');
}

// APNs JWT валиден до 60 мин и не должен пересоздаваться чаще раза в 20 мин —
// кэшируем и обновляем раз в ~50 мин.
let cachedToken: { token: string; iatSec: number } | null = null;

function getProviderToken(): string {
   const nowSec = Math.floor(Date.now() / 1000);
   if (cachedToken && nowSec - cachedToken.iatSec < 50 * 60) {
      return cachedToken.token;
   }
   const token = jwt.sign(
      { iss: APNS_TEAM_ID, iat: nowSec },
      loadSigningKey(),
      {
         algorithm: 'ES256',
         header: { alg: 'ES256', kid: APNS_KEY_ID as string },
      },
   );
   cachedToken = { token, iatSec: nowSec };
   return token;
}

// Переиспользуемая HTTP/2-сессия к APNs. Apple рекомендует держать соединение
// живым и слать в него много пушей; новое соединение на каждый звонок ведёт к
// throttling. Кэш сбрасывается при error/close/goaway — следующий вызов
// переподключится сам.
let apnsSession: http2.ClientHttp2Session | null = null;

function getApnsSession(): http2.ClientHttp2Session {
   if (apnsSession && !apnsSession.closed && !apnsSession.destroyed) {
      return apnsSession;
   }
   const session = http2.connect(APNS_HOST);
   const drop = () => {
      if (apnsSession === session) apnsSession = null;
   };
   session.on('error', (err) => {
      logger.error({ err }, 'APNs session error');
      drop();
   });
   session.on('close', drop);
   session.on('goaway', drop);
   // idle keep-alive соединение не должно держать event-loop живым.
   session.unref();
   apnsSession = session;
   return session;
}

export async function sendVoipPush(
   voipToken: string,
   payload: VoipPushPayload,
): Promise<VoipPushResult> {
   if (!isVoipConfigured) {
      logger.warn(
         { callId: payload.call_id },
         'APNs VoIP not configured (APNS_* env missing) — iOS VoIP push skipped',
      );
      return { ok: false, reason: 'not_configured' };
   }

   // Битый APNS_KEY_P8 (невалидный PEM/base64) роняет jwt.sign — деградируем в
   // no-op так же мягко, как при отсутствии конфига, а не бросаем наружу.
   let providerToken: string;
   try {
      providerToken = getProviderToken();
   } catch (err) {
      logger.error(
         { err, callId: payload.call_id },
         'APNs provider token build failed (bad APNS_KEY_P8?) — iOS VoIP push skipped',
      );
      return { ok: false, reason: 'bad_key' };
   }

   const body = JSON.stringify({
      aps: {}, // UI рисует CallKit на клиенте — alert не нужен
      type: 'incoming_call',
      call_id: payload.call_id,
      caller_id: payload.caller_id,
      caller_name: payload.caller_name,
   });

   return new Promise<VoipPushResult>((resolve) => {
      let settled = false;
      const finish = (r: VoipPushResult) => {
         if (!settled) {
            settled = true;
            resolve(r);
         }
      };

      // Общая keep-alive сессия (не закрываем её после запроса — только стрим).
      let client: http2.ClientHttp2Session;
      try {
         client = getApnsSession();
      } catch (err) {
         logger.error({ err, callId: payload.call_id }, 'APNs connect failed');
         return finish({ ok: false, reason: 'connect_failed' });
      }

      const expiration = Math.floor(Date.now() / 1000) + PUSH_TTL_SEC;
      const req = client.request({
         ':method': 'POST',
         ':path': `/3/device/${voipToken}`,
         authorization: `bearer ${providerToken}`,
         'apns-topic': `${APNS_BUNDLE_ID}.voip`,
         'apns-push-type': 'voip',
         'apns-priority': '10',
         'apns-expiration': String(expiration),
         'content-type': 'application/json',
         'content-length': Buffer.byteLength(body),
      });

      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
         logger.error({ callId: payload.call_id }, 'APNs request timeout');
         req.close();
         finish({ ok: false, reason: 'timeout' });
      });

      let status = 0;
      let data = '';
      req.on('response', (headers) => {
         status = Number(headers[':status']) || 0;
      });
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
         data += chunk;
      });
      req.on('end', () => {
         if (status === 200) {
            return finish({ ok: true });
         }
         let reason = data;
         try {
            reason = JSON.parse(data)?.reason || data;
         } catch {
            // тело не JSON — оставляем как есть
         }
         const invalidToken =
            status === 410 ||
            reason === 'BadDeviceToken' ||
            reason === 'Unregistered' ||
            reason === 'DeviceTokenNotForTopic';
         logger.warn(
            { status, reason, callId: payload.call_id },
            'APNs VoIP push rejected',
         );
         return finish({ ok: false, invalidToken, reason });
      });
      req.on('error', (err) => {
         logger.error({ err, callId: payload.call_id }, 'APNs request error');
         finish({ ok: false, reason: 'request_error' });
      });
      // Backstop: стрим закрылся без end/error (например, упала общая сессия) —
      // finish идемпотентен, успешный путь уже отрезолвил выше.
      req.on('close', () => {
         finish({ ok: false, reason: 'closed' });
      });

      req.write(body);
      req.end();
   });
}
