import http from 'http';
import https from 'https';

/**
 * Общие keep-alive агенты для исходящих HTTP-вызовов (Яндекс, Eskiz, ...).
 * Без keep-alive каждый вызов платит TCP+TLS handshake — на горячих путях
 * (геокодер, SMS при request-otp) это десятки миллисекунд на запрос.
 */
export const keepAliveHttpAgent = new http.Agent({ keepAlive: true });
export const keepAliveHttpsAgent = new https.Agent({ keepAlive: true });
