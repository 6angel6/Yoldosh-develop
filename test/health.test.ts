import { describe, expect, it } from 'vitest';
import { app } from '../src/main';
import request from 'supertest';

describe('Health Route', () => {
   it('GET /health returns 200 with dependency statuses', async () => {
      const response = await request(app).get('/api/v1/health');
      expect(response.status).toBe(200);

      // Эндпоинт отдаёт JSON-снимок здоровья (см. shared/middleware/healthCheck.ts):
      // статус + состояние зависимостей.
      const body = JSON.parse(response.text);
      expect(body.status).toBe('healthy');
      expect(body.dependencies.database.status).toBe('connected');
      expect(body.dependencies.redis.status).toBe('connected');
   });
});
