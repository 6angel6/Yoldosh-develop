import request from 'supertest';
import { app } from '../../src/main';

export const loginUser = async (phoneNumber: string): Promise<string> => {
   await request(app).post('/api/v1/auth/request-otp').send({ phoneNumber });

   const loginResponse = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phoneNumber, otp: '0000' });

   if (loginResponse.status !== 200 || !loginResponse.body.data.accessToken) {
      throw new Error(`Failed to log in user ${phoneNumber} for testing.`);
   }

   return loginResponse.body.data.accessToken;
};
