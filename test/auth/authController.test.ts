import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/main';
import User from '../../src/user/models/User';

describe('Auth Module', () => {
   beforeEach(async () => {
      await User.destroy({ where: {} });
   });

   describe('POST /api/v1/auth/request-otp', () => {
      it('should return 200 OK and create a new unverified user for a new phone number', async () => {
         const phoneNumber = '+998901234567';
         const response = await request(app)
            .post('/api/v1/auth/request-otp')
            .send({ phoneNumber });

         expect(response.status).toBe(200);
         expect(response.body.message).toBe('OTP sent successfully.');

         const newUser = await User.findOne({ where: { phoneNumber } });
         expect(newUser).not.toBeNull();
         expect(newUser!.verified).toBe(false);
         expect(newUser!.otp).not.toBeNull();
      });

      it('should return 200 OK and send an OTP for an existing verified user', async () => {
         const phoneNumber = '+998909876543';
         await User.create({
            firstName: 'Existing',
            lastName: 'User',
            phoneNumber,
            verified: true,
         });

         const response = await request(app)
            .post('/api/v1/auth/request-otp')
            .send({ phoneNumber });

         expect(response.status).toBe(200);
         const usersCount = await User.count({ where: { phoneNumber } });
         expect(usersCount).toBe(1);
      });

      it('should return 400 Bad Request for an invalid phone number format', async () => {
         const response = await request(app)
            .post('/api/v1/auth/request-otp')
            .send({ phoneNumber: '123' });

         expect(response.status).toBe(400);
         expect(response.body.message).toContain('Validation failed.');
      });
   });

   // Test suite for the /verify-otp endpoint
   describe('POST /api/v1/auth/verify-otp', () => {
      const phoneNumber = '+998901112233';

      it('should return user ID for a new user with a correct OTP to continue registration', async () => {
         await request(app)
            .post('/api/v1/auth/request-otp')
            .send({ phoneNumber });

         const response = await request(app)
            .post('/api/v1/auth/verify-otp')
            .send({ phoneNumber, otp: '0000' }); // Using the test OTP '0000'

         expect(response.status).toBe(200);
         expect(response.body.data).toHaveProperty('userId');
         expect(response.body.message).toBe(
            'OTP verified. Please complete your profile.',
         );
      });

      it('should return tokens and user data for an existing verified user with a correct OTP', async () => {
         await User.create({
            firstName: 'Verified',
            lastName: 'User',
            phoneNumber,
            verified: true,
         });
         await request(app)
            .post('/api/v1/auth/request-otp')
            .send({ phoneNumber });

         const response = await request(app)
            .post('/api/v1/auth/verify-otp')
            .send({ phoneNumber, otp: '0000' });

         expect(response.status).toBe(200);
         expect(response.body.data).toHaveProperty('accessToken');
         expect(response.body.data).toHaveProperty('refreshToken');
         expect(response.body.data).toHaveProperty('user');
         expect(response.body.message).toBe('Login successful.');
      });

      it('should return 400 Bad Request for an incorrect OTP', async () => {
         await request(app)
            .post('/api/v1/auth/request-otp')
            .send({ phoneNumber });

         const response = await request(app)
            .post('/api/v1/auth/verify-otp')
            .send({ phoneNumber, otp: '1111' });

         expect(response.status).toBe(400);
         // Контроллер маскирует конкретную причину единым текстом в errors
         // (badRequest(res, errors) — message остаётся дефолтным 'Bad Request.').
         expect(response.body.errors).toBe('Invalid OTP or login failed.');
      });
   });

   describe('POST /api/v1/auth/complete-profile', () => {
      const phoneNumber = '+998903334455';

      it('should successfully complete registration and return tokens', async () => {
         await request(app)
            .post('/api/v1/auth/request-otp')
            .send({ phoneNumber });
         const verifyResponse = await request(app)
            .post('/api/v1/auth/verify-otp')
            .send({ phoneNumber, otp: '0000' });

         const userId = verifyResponse.body.data.userId;

         const response = await request(app)
            .post('/api/v1/auth/complete-profile')
            .field('userId', userId)
            .field('firstName', 'John')
            .field('lastName', 'Doe');

         expect(response.status).toBe(201);
         expect(response.body.data).toHaveProperty('accessToken');
         expect(response.body.data).toHaveProperty('user');
         expect(response.body.data.user.firstName).toBe('John');

         const updatedUser = await User.findByPk(userId);
         expect(updatedUser!.verified).toBe(true);
      });

      it('should return 404 Not Found for a non-existent userId', async () => {
         // UUID должен быть валидным по RFC 4122 (z.uuid() проверяет версию),
         // иначе запрос срежется валидацией с 400 и до "not found" не дойдёт.
         const response = await request(app)
            .post('/api/v1/auth/complete-profile')
            .field('userId', '11111111-1111-4111-8111-111111111111')
            .field('firstName', 'John');

         expect(response.status).toBe(404);
         expect(response.body.message).toBe('User not found');
      });

      it('should return 409 Conflict if the user is already verified', async () => {
         const user = await User.create({
            firstName: 'Already',
            lastName: 'Verified',
            phoneNumber,
            verified: true,
         });

         const response = await request(app)
            .post('/api/v1/auth/complete-profile')
            .field('userId', user.id)
            .field('firstName', 'John');

         expect(response.status).toBe(409);
         expect(response.body.message).toBe(
            'User is already verified and registered.',
         );
      });
   });

   // Test suite for token-related endpoints
   describe('Token Management', () => {
      const phoneNumber = '+998905556677';
      let refreshToken = '';
      let accessToken = '';

      beforeEach(async () => {
         await request(app)
            .post('/api/v1/auth/request-otp')
            .send({ phoneNumber });
         const verifyResponse = await request(app)
            .post('/api/v1/auth/verify-otp')
            .send({ phoneNumber, otp: '0000' });

         const userId = verifyResponse.body.data.userId;

         const completeResponse = await request(app)
            .post('/api/v1/auth/complete-profile')
            .field('userId', userId)
            .field('firstName', 'Token');

         refreshToken = completeResponse.body.data.refreshToken;
         accessToken = completeResponse.body.data.accessToken;
      });

      // Test for /refresh-token
      it('POST /api/v1/auth/refresh-token should return new tokens with a valid refresh token', async () => {
         const response = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('Cookie', `refresh-token=${refreshToken}`);

         expect(response.status).toBe(200);
         expect(response.body.data).toHaveProperty('accessToken');
         expect(response.body.data).toHaveProperty('refreshToken');
      });

      it('POST /api/v1/auth/refresh-token should return 401 Unauthorized without a refresh token', async () => {
         const response = await request(app).post('/api/v1/auth/refresh-token');

         expect(response.status).toBe(401);
         expect(response.body.message).toBe('Refresh token not found');
      });

      // Test for /logout — роут за auth-middleware: без токена будет 401.
      it('POST /api/v1/auth/logout should clear the refresh token cookie', async () => {
         const response = await request(app)
            .post('/api/v1/auth/logout')
            .set('Authorization', `Bearer ${accessToken}`);

         expect(response.status).toBe(200);
         expect(response.header['set-cookie'][0]).toContain('refresh-token=;');
         expect(response.body.message).toBe('Logged out successfully');
      });
   });
});
