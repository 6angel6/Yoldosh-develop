import fs from 'fs';
import path from 'path';
import { UserLanguage } from '../../src/user/models/User';
import logger from '../utils/logger';
import type {
   TranslationKey,
   TranslationKeyWithParams,
   TranslationKeyWithoutParams,
   TranslationParams,
} from './types';

type TranslationValue = string | { [key: string]: TranslationValue };
type Translations = { [key: string]: TranslationValue };

const translationsCache: Record<UserLanguage, Translations> = {
   [UserLanguage.Russian]: {},
   [UserLanguage.Uzbek]: {},
   [UserLanguage.English]: {},
};

let initPromise: Promise<void> | null = null;
let isInitialized = false;

async function loadTranslations(): Promise<void> {
   // В production (Docker) файлы в shared/i18n/locales относительно корня
   // В development __dirname будет dist/shared/i18n или shared/i18n
   const localesDir =
      process.env.NODE_ENV === 'production'
         ? path.join(process.cwd(), 'shared', 'i18n', 'locales')
         : path.join(__dirname, 'locales');

   const languageFiles: Record<UserLanguage, string> = {
      [UserLanguage.Russian]: 'ru.json',
      [UserLanguage.Uzbek]: 'uz.json',
      [UserLanguage.English]: 'en.json',
   };

   const loadPromises = Object.entries(languageFiles).map(
      async ([lang, fileName]) => {
         try {
            const filePath = path.join(localesDir, fileName);
            const fileContent = await fs.promises.readFile(filePath, 'utf-8');
            translationsCache[lang as UserLanguage] = JSON.parse(fileContent);
            logger.info(`Loaded ${lang} translations from ${fileName}`);
         } catch (error) {
            logger.error(
               { error, lang, fileName },
               `Failed to load translations for ${lang}`,
            );
         }
      },
   );

   await Promise.all(loadPromises);
   isInitialized = true;
}

async function ensureInitialized(): Promise<void> {
   if (isInitialized) {
      return;
   }

   if (initPromise === null) {
      initPromise = loadTranslations();
   }

   await initPromise;
}

initPromise = loadTranslations();

function getNestedValue(obj: Translations, path: string): string | undefined {
   const keys = path.split('.');
   let current: any = obj;

   for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
         current = current[key];
      } else {
         return undefined;
      }
   }

   return typeof current === 'string' ? current : undefined;
}

function interpolate(
   text: string,
   params?: Record<string, string | number>,
): string {
   if (!params) {
      return text;
   }

   return Object.entries(params).reduce(
      (str, [paramKey, value]) =>
         str
            .replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(value))
            .replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value)),
      text,
   );
}

export function tAsync(
   key: TranslationKeyWithoutParams,
   language?: UserLanguage,
): Promise<string>;
export function tAsync<K extends TranslationKeyWithParams>(
   key: K,
   language: UserLanguage,
   params: TranslationParams[K],
): Promise<string>;
export function tAsync(
   key: TranslationKey,
   language: UserLanguage,
   params?: Record<string, string | number>,
): Promise<string>;

export async function tAsync(
   key: TranslationKey,
   language: UserLanguage = UserLanguage.Russian,
   params?: Record<string, string | number>,
): Promise<string> {
   await ensureInitialized();

   const translation = getNestedValue(translationsCache[language], key);

   if (!translation) {
      logger.warn(
         { key, language },
         'Missing translation, falling back to Russian',
      );
      const fallback = getNestedValue(
         translationsCache[UserLanguage.Russian],
         key,
      );
      if (!fallback) {
         logger.error({ key }, 'Translation key not found in any language');
         return key;
      }
      return interpolate(fallback, params);
   }

   return interpolate(translation, params);
}

export function t(
   key: TranslationKeyWithoutParams,
   language?: UserLanguage,
): string;
export function t<K extends TranslationKeyWithParams>(
   key: K,
   language: UserLanguage,
   params: TranslationParams[K],
): string;
export function t(
   key: TranslationKey,
   language: UserLanguage,
   params?: Record<string, string | number>,
): string;

export function t(
   key: TranslationKey,
   language: UserLanguage = UserLanguage.Russian,
   params?: Record<string, string | number>,
): string {
   // If not initialized, log warning but continue (for backwards compatibility)
   if (!isInitialized) {
      logger.warn(
         { key },
         'Translations not fully loaded yet. Consider using tAsync() instead',
      );
   }

   const translation = getNestedValue(translationsCache[language], key);

   if (!translation) {
      logger.warn(
         { key, language },
         'Missing translation, falling back to Russian',
      );
      const fallback = getNestedValue(
         translationsCache[UserLanguage.Russian],
         key,
      );
      if (!fallback) {
         logger.error({ key }, 'Translation key not found in any language');
         return key; // Return key itself as last resort
      }
      return interpolate(fallback, params);
   }

   return interpolate(translation, params);
}

export const getUserLanguage = (
   userLanguage?: UserLanguage | string | null,
): UserLanguage => {
   if (!userLanguage) {
      return UserLanguage.Russian;
   }

   const validLanguages = Object.values(UserLanguage);
   if (validLanguages.includes(userLanguage as UserLanguage)) {
      return userLanguage as UserLanguage;
   }

   return UserLanguage.Russian;
};

export const parseAcceptLanguage = (
   acceptLanguageHeader?: string,
): UserLanguage => {
   if (!acceptLanguageHeader) {
      return UserLanguage.Russian;
   }

   const languages = acceptLanguageHeader
      .split(',')
      .map((lang) => lang.split(';')[0].trim().toLowerCase());

   if (languages.some((lang) => lang.startsWith('ru'))) {
      return UserLanguage.Russian;
   }

   if (languages.some((lang) => lang.startsWith('uz'))) {
      return UserLanguage.Uzbek;
   }

   if (languages.some((lang) => lang.startsWith('en'))) {
      return UserLanguage.English;
   }

   return UserLanguage.Russian;
};

export const reloadTranslations = async (): Promise<void> => {
   isInitialized = false;
   initPromise = null;
   await ensureInitialized();
};

export const waitForTranslations = async (): Promise<void> => {
   await ensureInitialized();
};

export const isTranslationsReady = (): boolean => {
   return isInitialized;
};

export const hasTranslationAsync = async (
   key: TranslationKey,
   language: UserLanguage = UserLanguage.Russian,
): Promise<boolean> => {
   await ensureInitialized();
   return getNestedValue(translationsCache[language], key) !== undefined;
};

export const hasTranslation = (
   key: TranslationKey,
   language: UserLanguage = UserLanguage.Russian,
): boolean => {
   return getNestedValue(translationsCache[language], key) !== undefined;
};

export default {
   t,
   tAsync,
   getUserLanguage,
   parseAcceptLanguage,
   reloadTranslations,
   waitForTranslations,
   isTranslationsReady,
   hasTranslation,
   hasTranslationAsync,
   ensureInitialized,
};
