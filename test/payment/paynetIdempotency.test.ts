/**
 * Идемпотентность performTransaction: Paynet ретраит запросы, и повторный
 * PerformTransaction с тем же transactionId обязан отклоняться кодом 201
 * («транзакция уже существует»), а баланс — пополняться ровно один раз.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import User, { UserRole } from '../../src/user/models/User';
import Wallet from '../../src/payment/models/Wallet';
import Payment from '../../src/payment/models/Payment';
import * as paynetService from '../../src/payment/service/paynetService';
import { PaynetError } from '../../shared/utils/errorHandler';
import { PAYNET_SERVICE_ID_INT } from '../../shared/api/paynet/paynetConfig';

describe('Paynet: идемпотентность performTransaction', () => {
   const phone = '+998994444444';
   let userId: string;

   beforeEach(async () => {
      const user = await User.create({
         firstName: 'Paynet',
         lastName: 'Client',
         phoneNumber: phone,
         role: UserRole.Passenger,
         verified: true,
      } as any);
      userId = user.id;
      await Wallet.create({ userId, balance: 0 } as any);
   });

   it('повторный вызов с тем же transactionId отклоняется кодом 201, баланс пополнен один раз', async () => {
      const AMOUNT_TIYIN = 50_000; // 500 сомов
      const params = {
         amount: AMOUNT_TIYIN,
         serviceId: PAYNET_SERVICE_ID_INT,
         transactionId: 'paynet-idempotency-test-1',
         fields: { client_id: phone.replace('+', '') },
      };

      const first = await paynetService.performTransaction(params);
      expect(first.providerTrnId).toBeTruthy();

      const error = await paynetService
         .performTransaction({ ...params })
         .then(() => null)
         .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(PaynetError);
      expect((error as PaynetError).code).toBe(201);

      // Баланс пополнен ровно один раз: 50 000 тийинов = 500 сомов
      const wallet = await Wallet.findOne({ where: { userId } });
      expect(Number(wallet!.balance)).toBe(AMOUNT_TIYIN / 100);

      // И платёж с этим providerTransactionId существует в одном экземпляре
      const paymentsCount = await Payment.count({
         where: { providerTransactionId: params.transactionId },
      });
      expect(paymentsCount).toBe(1);
   });

   it('разные transactionId проходят независимо — идемпотентный ключ не глобален', async () => {
      const AMOUNT_TIYIN = 10_000; // 100 сомов
      const makeParams = (id: string) => ({
         amount: AMOUNT_TIYIN,
         serviceId: PAYNET_SERVICE_ID_INT,
         transactionId: id,
         fields: { client_id: phone.replace('+', '') },
      });

      await paynetService.performTransaction(makeParams('paynet-idem-a'));
      await paynetService.performTransaction(makeParams('paynet-idem-b'));

      const wallet = await Wallet.findOne({ where: { userId } });
      expect(Number(wallet!.balance)).toBe((2 * AMOUNT_TIYIN) / 100);
   });
});
