import { Transaction } from 'sequelize';
import ReferralCode from '../models/ReferralCode';
import Referral, { ReferralCreationAttributes } from '../models/Referral';
import ReferralReward from '../models/ReferralReward';

interface ReferralCodeDto {
   userId: string;
   code: string;
   isActive?: boolean;
}

export const createReferralCode = async (
   data: ReferralCodeDto,
   transaction?: Transaction,
) => {
   return ReferralCode.create(data, { transaction });
};

export const getReferralCode = async (
   userId: string,
   transaction?: Transaction,
) => {
   return ReferralCode.findOne({ where: { userId: userId } });
};

export const findCodeByCode = async (
   code: string,
   transaction?: Transaction,
): Promise<ReferralCode | null> => {
   return ReferralCode.findOne({
      where: { code },
      transaction,
   });
};

export const createReferral = async (
   data: ReferralCreationAttributes,
   transaction?: Transaction,
): Promise<Referral> => {
   return Referral.create(data, { transaction });
};

export const findReferralByReferredUserId = async (
   referredUserId: string,
   transaction?: Transaction,
): Promise<Referral | null> => {
   return Referral.findOne({
      where: { referredUserId },
      transaction,
   });
};

export const findActiveReward = async (
   transaction?: Transaction,
): Promise<ReferralReward | null> => {
   return ReferralReward.findOne({
      where: { isActive: true },
      transaction,
   });
};

export const findReferralById = async (
   referralId: string,
   transaction?: Transaction,
): Promise<Referral | null> => {
   return Referral.findByPk(referralId, { transaction });
};
