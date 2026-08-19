/**
 * Script to validate translation files
 * Checks:
 * 1. All languages have the same keys
 * 2. All parameters in translations match
 * 3. No empty translations
 *
 * Run with: npx ts-node shared/i18n/scripts/validateTranslations.ts
 */

import fs from 'fs';
import path from 'path';

interface TranslationObject {
   [key: string]: string | TranslationObject;
}

function getAllKeys(obj: TranslationObject, prefix = ''): Set<string> {
   const keys = new Set<string>();

   for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'string') {
         keys.add(fullKey);
      } else if (typeof value === 'object') {
         const nestedKeys = getAllKeys(value, fullKey);
         nestedKeys.forEach((k) => keys.add(k));
      }
   }

   return keys;
}

function extractParams(text: string): Set<string> {
   const params = new Set<string>();
   const matches = text.match(/\{\{?(\w+)\}?\}/g);

   if (matches) {
      matches.forEach((match) => {
         const param = match.replace(/\{\{?|\}?\}/g, '');
         params.add(param);
      });
   }

   return params;
}

function getValue(obj: TranslationObject, key: string): string | undefined {
   const keys = key.split('.');
   let current: any = obj;

   for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
         current = current[k];
      } else {
         return undefined;
      }
   }

   return typeof current === 'string' ? current : undefined;
}

function validateTranslations() {
   const localesDir = path.join(__dirname, '../locales');
   const languages = ['ru', 'uz', 'en'];

   console.log('Starting translation validation...\n');

   const translations: { [lang: string]: TranslationObject } = {};
   const allKeys: { [lang: string]: Set<string> } = {};

   languages.forEach((lang) => {
      const filePath = path.join(localesDir, `${lang}.json`);
      try {
         translations[lang] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
         allKeys[lang] = getAllKeys(translations[lang]);
         console.log(`Loaded ${lang}.json: ${allKeys[lang].size} keys`);
      } catch (error) {
         console.error(`Failed to load ${lang}.json:`, error);
         process.exit(1);
      }
   });

   console.log('');

   let hasErrors = false;

   console.log('Checking key consistency...');
   const baseKeys = allKeys['ru'];

   languages.forEach((lang) => {
      if (lang === 'ru') return;

      const missingInLang = Array.from(baseKeys).filter(
         (key) => !allKeys[lang].has(key),
      );
      const extraInLang = Array.from(allKeys[lang]).filter(
         (key) => !baseKeys.has(key),
      );

      if (missingInLang.length > 0) {
         console.error(`\n${lang}.json is missing keys from ru.json:`);
         missingInLang.forEach((key) => console.error(`   - ${key}`));
         hasErrors = true;
      }

      if (extraInLang.length > 0) {
         console.error(`\n${lang}.json has extra keys not in ru.json:`);
         extraInLang.forEach((key) => console.error(`   - ${key}`));
         hasErrors = true;
      }
   });

   if (!hasErrors) {
      console.log('All languages have consistent keys\n');
   }

   console.log('Checking parameter consistency...');
   let paramErrors = false;

   baseKeys.forEach((key) => {
      const ruValue = getValue(translations['ru'], key);
      if (!ruValue) return;

      const ruParams = extractParams(ruValue);

      languages.forEach((lang) => {
         if (lang === 'ru') return;

         const langValue = getValue(translations[lang], key);
         if (!langValue) return;

         const langParams = extractParams(langValue);

         const missingParams = Array.from(ruParams).filter(
            (p) => !langParams.has(p),
         );
         const extraParams = Array.from(langParams).filter(
            (p) => !ruParams.has(p),
         );

         if (missingParams.length > 0 || extraParams.length > 0) {
            console.error(`\nParameter mismatch for key: ${key}`);
            console.error(
               `   ru.json params: ${Array.from(ruParams).join(', ') || 'none'}`,
            );
            console.error(
               `   ${lang}.json params: ${Array.from(langParams).join(', ') || 'none'}`,
            );
            if (missingParams.length > 0) {
               console.error(
                  `   Missing in ${lang}: ${missingParams.join(', ')}`,
               );
            }
            if (extraParams.length > 0) {
               console.error(`   Extra in ${lang}: ${extraParams.join(', ')}`);
            }
            paramErrors = true;
         }
      });
   });

   if (!paramErrors) {
      console.log('All parameters are consistent\n');
   } else {
      hasErrors = true;
   }

   console.log('Checking for empty translations...');
   let emptyErrors = false;

   languages.forEach((lang) => {
      const emptyKeys: string[] = [];

      allKeys[lang].forEach((key) => {
         const value = getValue(translations[lang], key);
         if (!value || value.trim() === '') {
            emptyKeys.push(key);
         }
      });

      if (emptyKeys.length > 0) {
         console.error(`\n${lang}.json has empty translations:`);
         emptyKeys.forEach((key) => console.error(`   - ${key}`));
         emptyErrors = true;
      }
   });

   if (!emptyErrors) {
      console.log('No empty translations found\n');
   } else {
      hasErrors = true;
   }

   console.log('\n' + '='.repeat(50));
   if (hasErrors) {
      console.error('Validation FAILED - please fix the errors above');
      process.exit(1);
   } else {
      console.log('All validations PASSED');
      console.log(`Total keys: ${baseKeys.size}`);
      console.log(`Languages: ${languages.join(', ')}`);
   }
}

try {
   validateTranslations();
} catch (error) {
   console.error('Validation error:', error);
   process.exit(1);
}
