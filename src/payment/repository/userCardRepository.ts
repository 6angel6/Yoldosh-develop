import { Op, Transaction } from 'sequelize';
import UserCard, { CardType } from '../models/UserCard';

export interface CreateUsertCard {
   id?: string;
   userId: string;
   contractId?: string;
   cardNumber?: string;
   expiry?: string;
}

export interface UpdateUsertCard {
   userId: string;
   contractId?: string;
   cardNumber?: string;
   expiry?: string;
   cardType?: CardType;
}

export const createUserCard = async (
   data: CreateUsertCard,
   transaction?: Transaction,
): Promise<UserCard> => {
   return await UserCard.create(data, { transaction });
};
export const updateUserCard = async (
   data: UpdateUsertCard,
   transaction?: Transaction,
) => {
   return UserCard.update(
      {
         contractId: data.contractId,
         cardNumber: data.cardNumber,
         expiry: data.expiry,
         cardType: data.cardType,
      },
      {
         where: { userId: data.userId, contractId: data.contractId },
         transaction,
      },
   );
};

export const getCardById = async (
   cardId: string,
   transaction?: Transaction,
): Promise<UserCard> => {
   const queryOptions: any = {
      where: { id: cardId },
   };

   if (transaction) {
      queryOptions.transaction = transaction;
   }
   return await UserCard.findOne(queryOptions);
};

export const getCardByIdAndUserId = async (
   cardId: string,
   userId: string,
   transaction?: Transaction,
): Promise<UserCard | null> => {
   const queryOptions: any = {
      where: { id: cardId, userId: userId },
   };

   if (transaction) {
      queryOptions.transaction = transaction;
   }
   return await UserCard.findOne(queryOptions);
};

export const deleteCard = async (cardId: string, transaction?: Transaction) => {
   const queryOptions: any = {
      where: { id: cardId },
   };
   if (transaction) {
      queryOptions.transaction = transaction;
   }
   return await UserCard.destroy(queryOptions);
};

export const findCardsByUserId = async (
   userId: string,
   transaction?: Transaction,
): Promise<UserCard[]> => {
   return UserCard.findAll({
      attributes: ['id', 'userId', 'cardNumber', 'expiry', 'cardType'],
      where: {
         userId: userId,
         cardType: {
            [Op.ne]: CardType.NONE,
         },
      },
      order: [['createdAt', 'DESC']],
      transaction,
   });
};
