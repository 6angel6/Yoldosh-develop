import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
   level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
   // level строкой ('info'/'error'), а не числом (30/50): так LogQL-фильтры и
   // Loki-лейбл level читаются человеком и Grafana-панелями без маппинга кодов.
   formatters: {
      level(label) {
         return { level: label };
      },
   },
   // PII-политика: телефоны, OTP, токены, учётки и данные карт не попадают в логи.
   // Маскирование централизовано здесь, а не руками в каждом вызове.
   redact: {
      paths: [
         'req.headers.authorization',
         'req.headers.cookie',
         'password',
         'otp',
         'token',
         'accessToken',
         'refreshToken',
         'phoneNumber',
         'phone_number',
         'cardNumber',
         'card_number',
         'pan',
         'cvv',
         'cvc',
         'expiry',
         'expireDate',
         '*.password',
         '*.otp',
         '*.token',
         '*.accessToken',
         '*.refreshToken',
         '*.phoneNumber',
         '*.phone_number',
         '*.cardNumber',
         '*.card_number',
         '*.pan',
         '*.cvv',
         '*.cvc',
         '*.expiry',
         '*.expireDate',
         'req.body.password',
         'req.body.otp',
         'req.body.token',
         'req.body.phoneNumber',
         'req.body.cardNumber',
         'req.body.card_number',
         'req.body.cvv',
         'req.body.pan',
      ],
      censor: (value: unknown, path: string[]) => {
         const key = path[path.length - 1];
         if (
            (key === 'phoneNumber' || key === 'phone_number') &&
            typeof value === 'string'
         ) {
            // +99890***4567 — маска вместо полного удаления
            return value.replace(/^(\+?\d{5})\d+(\d{4})$/, '$1***$2');
         }
         return '[REDACTED]';
      },
   },
   transport: isProd
      ? undefined
      : {
           target: 'pino-pretty',
           options: {
              colorize: true,
              translateTime: 'SYS:standard',
              singleLine: false,
           },
        },
});

export default logger;
