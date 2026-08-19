import { getOrSetCache, clearCache } from '../config/redis';
import * as restrictedWordRepository from '../../src/admin/moderation/repository/restrictedWordRepository';

const getRestrictedWords = async (): Promise<string[]> => {
   const cacheKey = 'restricted_words_list';
   return getOrSetCache(
      cacheKey,
      async () => {
         return await restrictedWordRepository.findAllRestrictedWords();
      },
      3600,
   ); // Cache for 1 hour
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

   const restrictedWords = await getRestrictedWords();
   if (restrictedWords.length > 0) {
      const regex = new RegExp(`\\b(${restrictedWords.join('|')})\\b`, 'gi');
      filtered = filtered.replace(regex, '*******');
   }

   return filtered;
};
