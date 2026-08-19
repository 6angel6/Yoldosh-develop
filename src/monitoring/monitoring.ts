import express from 'express';
import { metrics } from './controller/metricController';

export const monitoringRouter = express.Router();

monitoringRouter.get('/metrics', metrics);
