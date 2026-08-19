import { AdminAction, AdminLogEntityType } from '../../log/models/AdminLog';
import logger from '../../../../shared/utils/logger';
import { NotFoundError } from '../../../../shared/utils/errorHandler';
import { getOrSetCache, clearCache } from '../../../../shared/config/redis';
import * as adminLogService from '../../log/service/adminLogService';
import * as restrictedWordRepository from '../repository/restrictedWordRepository';

const getCachedRestrictedWords = async (): Promise<string[]> => {
   const cacheKey = 'restricted_words_list';
   return getOrSetCache(
      cacheKey,
      async () => {
         return await restrictedWordRepository.findAllRestrictedWords();
      },
      3600,
   );
};

export const addRestrictedWord = async (adminId: string, word: string) => {
   const newWord = await restrictedWordRepository.createRestrictedWord({
      word,
   });

   await adminLogService.logAction(
      adminId,
      AdminAction.ADD_RESTRICTED_WORD,
      undefined,
      String(newWord.id),
      AdminLogEntityType.RESTRICTED_WORD,
      {
         snapshot: { label: word },
         metadata: { word },
      },
   );
   await clearCache('restricted_words_list').catch((err) =>
      logger.warn({ err }, 'Cache invalidation failed'),
   );
   return newWord;
};

export const getRestrictedWords = async (options: {
   page: number;
   limit: number;
   sortBy: string;
   sortOrder: string;
   search?: string;
}) => {
   const { page, limit, sortBy, sortOrder, search } = options;
   const offset = (page - 1) * limit;

   const { count, rows } =
      await restrictedWordRepository.findAllWordsWithPagination({
         limit,
         offset,
         search,
         sortBy,
         sortOrder,
      });

   return {
      rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
   };
};

export const deleteRestrictedWord = async (adminId: string, wordId: number) => {
   const word = await restrictedWordRepository.findRestrictedWordById(wordId);
   if (!word) {
      throw new NotFoundError('Word not found.');
   }
   await restrictedWordRepository.deleteRestrictedWord(wordId);

   await adminLogService.logAction(
      adminId,
      AdminAction.DELETE_RESTRICTED_WORD,
      undefined,
      String(wordId),
      AdminLogEntityType.RESTRICTED_WORD,
      {
         snapshot: { label: word.word },
         metadata: { word: word.word },
      },
   );
   await clearCache('restricted_words_list').catch((err) =>
      logger.warn({ err }, 'Cache invalidation failed'),
   );
};

export const filterMessageContent = async (
   content?: string,
): Promise<string | undefined> => {
   if (!content) return content;
   let filtered = content;

   filtered = filtered.replace(/\+998\d{9}/g, '*******');
   filtered = filtered.replace(
      /\b((https?:\/\/|www\.)[^\s]+|[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?)/gi,
      '*******',
   );

   const restrictedWords = await getCachedRestrictedWords();
   if (restrictedWords.length > 0) {
      const regex = new RegExp(`\\b(${restrictedWords.join('|')})\\b`, 'gi');
      filtered = filtered.replace(regex, '*******');
   }

   return filtered;
};
