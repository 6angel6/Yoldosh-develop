import * as searchRepository from '../repository/searchRepository';
import * as userRepository from '../repository/userRepository';
import { NotFoundError } from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';

export const saveSearch = async (data: {
   userId?: string | null;
   guestId?: string | null;
   from_city?: string;
   to_city?: string;
   from_address?: string | null;
   to_address?: string | null;
}) => {
   // Бизнес-проверка живёт в сервисе, репозиторий только пишет в БД.
   // Вызывающий (saveSearchHistory) ловит и логирует: история поиска
   // не сохраняется, сам поиск не падает.
   if (data.userId) {
      const userExists = await userRepository.findUserById(data.userId);
      if (!userExists) {
         throw new NotFoundError('User not found', ErrorCode.USER_NOT_FOUND);
      }
   }
   return await searchRepository.createSearch(data);
};

export const getSearchHistory = async (identifier: {
   userId?: string;
   guestId?: string;
}) => {
   return await searchRepository.findSearchesByIdentifier(identifier);
};
