import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

import mainRouter from './routers';
import { setupAssociations } from '../shared/models/Associations';
import { errorHandler } from '../shared/middleware/errorHandler';
import logger from '../shared/utils/logger';
import http from 'http';
import { initSocket } from '../shared/config/socket';
import { initChatWebSocket } from './chat/realtime/chatWsServer';
import compression from 'compression';
import { monitoringRouter } from './monitoring/monitoring';
import { metricsMiddleware } from './monitoring/service/metricService';
import { businessMetricsMiddleware } from './monitoring/middleware/businessMetrics';
import { startMetricsWorker } from './monitoring/workers/metricsWorker';
import path from 'path';

import { initFirebase } from '../shared/config/firebase';
import { healthCheck } from '../shared/middleware/healthCheck';
import { languageMiddleware } from '../shared/middleware/languageMiddleware';
import { startAllWorkers, shutdownAllWorkers } from './workers';
import { seedAdmins } from '../shared/seeds/adminSeed';
import { waitForTranslations } from '../shared/i18n/i18nService';
import {
   setupGracefulShutdown,
   trackActiveRequests,
} from '../shared/utils/gracefulShutdown';
import { DriverTestAccount } from '../shared/seeds/testDriver';

dotenv.config();

export const app = express();

const metricsServer = express();
metricsServer.use('/', monitoringRouter);

const PORT = process.env.PORT || 5000;
const METRICS_PORT = process.env.METRICS_PORT || 9100;

app.use(
   cors({
      credentials: true,
      origin: true,
   }),
);

const swaggerDocument = YAML.load('./swagger.yaml');

// Явный лимит тела: 413 вместо OOM на гигантском JSON. 1 МБ покрывает
// импорт от парсера с запасом (дефолт body-parser был 100 КБ)
app.use(express.json({ limit: '1mb' }));
app.use((req: any, res: any, next) => {
   const originalJson = res.json.bind(res);
   res.json = function (body: any) {
      res._body = body;
      return originalJson(body);
   };
   next();
});

app.use(cookieParser());

app.use(
   pinoHttp({
      logger,
      autoLogging: {
         ignore: (req) =>
            req.url === '/api/v1/health' || req.url === '/metrics',
      },
      genReqId: (req, res) => {
         const id = req.headers['x-request-id'] || uuidv4();
         res.setHeader('X-Request-ID', id);
         return id;
      },
      // 4xx → warn, 5xx → error: уровень читается Grafana/Loki без парсинга статуса
      customLogLevel: (req: any, res: any, err: any) => {
         if (err || res.statusCode >= 500) return 'error';
         if (res.statusCode >= 400) return 'warn';
         return 'info';
      },
      customProps: (req: any) => ({
         // единый correlation-id во всех логах (access + ошибки): requestId,
         // тот же, что кладут errorHandler/apiResponse — сквозная трассировка
         requestId: req.id,
         // route — шаблон (/trips/:id), не сырой URL: сырой url взрывает
         // кардинальность лейблов Loki; сам url остаётся обычным полем req.url
         route: req.route ? `${req.baseUrl}${req.route.path}` : undefined,
      }),
      serializers: {
         req(req: any) {
            const serialized: any = {
               id: req.id,
               method: req.method,
               url: req.url,
               query: req.query,
               userId: req.user?.id,
            };

            // Тела запросов в prod не логируются (PII: телефоны, платёжные
            // данные); вне prod — с маскировкой чувствительных полей
            if (
               process.env.NODE_ENV !== 'production' &&
               req.body &&
               Object.keys(req.body).length > 0
            ) {
               const sanitizedBody = { ...req.body };
               if (sanitizedBody.password) sanitizedBody.password = '***';
               if (sanitizedBody.token) sanitizedBody.token = '***';
               if (sanitizedBody.otp) sanitizedBody.otp = '***';
               if (sanitizedBody.phoneNumber) {
                  sanitizedBody.phoneNumber = String(
                     sanitizedBody.phoneNumber,
                  ).replace(/^(\+?\d{5})\d+(\d{4})$/, '$1***$2');
               }
               serialized.body = sanitizedBody;
            }

            return serialized;
         },
         res(res: any) {
            const serialized: any = {
               statusCode: res.statusCode,
            };

            if (res._body) {
               if (res.statusCode >= 400) {
                  serialized.body = res._body;
               } else if (process.env.NODE_ENV !== 'production') {
                  serialized.body = res._body;
               }
            }

            return serialized;
         },
      },
      customSuccessMessage: (req: any, res: any) => {
         if (res.statusCode >= 400) {
            return `request failed with status ${res.statusCode}`;
         }
         return 'request completed';
      },
      customErrorMessage: (req: any, res: any, err: any) => {
         return `request error: ${err.message}`;
      },
   }),
);

app.use(compression());
// Учёт in-flight запросов: graceful shutdown ждёт их завершения
app.use(trackActiveRequests);
app.use(metricsMiddleware);
app.use(businessMetricsMiddleware);
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(languageMiddleware);

app.use('/api/v1/', mainRouter);
app.use('/api/v1/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/api/v1/health', healthCheck);

app.use(errorHandler);

const server = http.createServer(app);
initSocket(server);
// Сырой WS-чат `chat.v1` на /api/v1/chat/ws — сосуществует с Socket.IO на
// том же сервере (маршрутизация по пути в обработчике upgrade).
initChatWebSocket(server);
initFirebase();

const startServer = async () => {
   try {
      logger.info('Loading i18n translations...');
      await waitForTranslations();
      logger.info('[OK] Translations loaded successfully');

      setupAssociations();
      await seedAdmins();
      await DriverTestAccount();

      logger.info('Database associations configured');

      await startAllWorkers();
      logger.info('Workers are up and running');

      server.listen(PORT, () => {
         logger.info({ port: PORT }, 'Server started');
      });

      metricsServer.listen(METRICS_PORT, () => {
         logger.info({ port: METRICS_PORT }, 'Metrics server started');

         startMetricsWorker();
         logger.info('Metrics worker started');

         printBanner();
      });

      setupGracefulShutdown(server, shutdownAllWorkers);
      logger.info('Graceful shutdown configured');
   } catch (error) {
      logger.error({ err: error }, 'Failed to start server');
      process.exit(1);
   }
};

export const printBanner = () => {
   const banner = `
     )                                       (   (    
  ( /(    (  (             )           (     )\\ ))\\ ) 
  )\\())   )\\ )\\ )       ( /(           )\\   (()/(()/( 
 ((_)\\ ( ((_|()/( (  (  )\\())  ___  ((((_)(  /(_))(_))
__ ((_))\\ _  ((_)))\\ )\\((_)\\  |___|  )\\ _ )\\(_))(_))  
\\ \\ / ((_) | _| |((_|(_) |(_)        (_)_\\(_) _ \\_ _| 
 \\ V / _ \\ / _\` / _ (_-< ' \\          / _ \\ |  _/| |  
  |_|\\___/_\\__,_\\___/__/_||_|        /_/ \\_\\|_| |___| 
`;

   logger.info(banner);
};

// void: отказ обработан внутри try/catch с process.exit(1)
void startServer();
