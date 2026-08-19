import { beforeEach, describe, expect, it } from 'vitest';
import User, { UserRole } from '../../src/user/models/User';
import Wallet from '../../src/payment/models/Wallet';
import * as paynetService from '../../src/payment/service/paynetService';
import { PAYNET_SERVICE_ID_INT } from '../../shared/api/paynet/paynetConfig';

/**
 * Баланс меняется по схеме read-modify-write внутри транзакции. Без
 * SELECT ... FOR UPDATE конкурентные пополнения читают один и тот же
 * устаревший баланс и затирают обновления друг друга (lost update):
 * из N параллельных пополнений на счету оседает меньше, чем N × сумма.
 * С блокировкой чтения́ сериализуются и итог сходится копейка в копейку.
 */
describe('Wallet: конкурентное изменение баланса', () => {
   const phone = '+998993333333';
   let userId: string;

   beforeEach(async () => {
      const user = await User.create({
         firstName: 'Wallet',
         lastName: 'Owner',
         phoneNumber: phone,
         role: UserRole.Passenger,
         verified: true,
      } as any);
      userId = user.id;
      await Wallet.create({ userId, balance: 0 } as any);
   });

   it('параллельные пополнения Paynet не теряют обновления (FOR UPDATE держит)', async () => {
      const PARALLEL = 10;
      const AMOUNT_TIYIN = 10_000; // 100 сомов

      const results = await Promise.allSettled(
         Array.from({ length: PARALLEL }, (_, i) =>
            paynetService.performTransaction({
               amount: AMOUNT_TIYIN,
               serviceId: PAYNET_SERVICE_ID_INT,
               transactionId: `wallet-concurrency-test-${i}`,
               fields: { client_id: phone.replace('+', '') },
            }),
         ),
      );

      const failed = results.filter((r) => r.status === 'rejected');
      expect(failed).toHaveLength(0);

      const wallet = await Wallet.findOne({ where: { userId } });
      expect(Number(wallet!.balance)).toBe((PARALLEL * AMOUNT_TIYIN) / 100);
   });
});
