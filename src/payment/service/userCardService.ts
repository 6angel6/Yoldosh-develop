import db from '../../../shared/config/database';
import * as userCardRepository from '../../payment/repository/userCardRepository';
import logger from '../../../shared/utils/logger';
import {
   InternalServerError,
   NotFoundError,
} from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';
import * as ipakYoliApi from '../../../shared/api/ipakYoli/ipakApi';
import { CardType } from '../models/UserCard';
import { findUserById } from '../../user/repository/userRepository';
import { withDeadlockRetry } from '../../../shared/utils/withDeadlockRetry';

export const detectCardType = (cardNumber: string): CardType => {
   const cleaned = cardNumber.replace(/\D/g, '');

   if (cleaned.startsWith('8600')) return CardType.UZCARD;
   if (cleaned.startsWith('5614')) return CardType.UZCARD;
   if (cleaned.startsWith('9860')) return CardType.HUMO;

   return CardType.NONE;
};

export const createUserCard = async (userId: string) => {
   const user = await findUserById(userId);
   if (!user) {
      throw new NotFoundError('User not found for card creation.');
   }
   logger.info({ userId: userId }, 'Initiating card creation with Ipak.');

   const response = await ipakYoliApi.contractCreate({
      clientId: user.id,
      successUrl: 'https://www.yoldosh.uz',
      failUrl: 'https://www.yoldosh.uz',
      clientInfo: {
         phoneNumber: user.phoneNumber,
         firstName: user.firstName,
      },
   });

   const card = await userCardRepository.createUserCard({
      userId: user.id,
      contractId: response.contract_id,
   });
   if (!card) {
      throw new InternalServerError(
         'Unable to create user with Ipak.',
         ErrorCode.INTERNAL_UNEXPECTED,
      );
   }
   logger.info({ card }, 'Url creation in contractCreate request successful.');
   return response;
};

interface confirmCard {
   contractId: string;
   userId: string;
   panMasked: string;
   expiry: string;
}

export const confirmUserCardCreate = async (args: confirmCard) => {
   const { contractId, userId, panMasked, expiry } = args;

   return withDeadlockRetry(async (t) => {
      logger.info(
         { userId: userId, contractId: contractId },
         'Initiating card confirmation with Ipak.',
      );

      logger.info(
         {
            CardNumber: panMasked,
            Expiry: expiry,
         },
         'API card confirmation successful. Saving to database.',
      );

      const dataToSave = {
         userId: userId,
         cardNumber: panMasked,
         expiry: expiry,
         cardType: detectCardType(panMasked),
         contractId: contractId,
      };

      const userCard = await userCardRepository.updateUserCard(dataToSave, t);

      logger.info(
         { userId, panMasked, expiry },
         'User card successfully saved to database.',
      );

      return userCard;
   });
};

export const getAllUsersCards = async (userId: string) => {
   logger.info({ userId }, 'Fetching user cards directly from the database.');

   const localCards = await userCardRepository.findCardsByUserId(userId);
   if (!localCards) {
      throw new NotFoundError('Could not find user cards.');
   }

   return localCards;
};

export const deleteCard = async (userCardId: string) => {
   const foundCard = await userCardRepository.getCardById(userCardId);
   const response = await ipakYoliApi.ContractCancel({
      contract_id: foundCard.contractId,
   });
   logger.info(
      { userCardId, response },
      'Card deletion request sent to  Ipak uccessfully.',
   );

   await userCardRepository.deleteCard(userCardId);
   logger.info({ userCardId }, 'Card deletion In DB successfully.');
   return response;
};
