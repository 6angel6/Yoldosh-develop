/**
 * Script to automatically generate TypeScript types from translation JSON files
 * Run with: npx ts-node shared/i18n/scripts/generateTypes.ts
 */

import fs from 'fs';
import path from 'path';

interface TranslationObject {
   [key: string]: string | TranslationObject;
}

function extractKeys(
   obj: TranslationObject,
   prefix = '',
): { keys: string[]; paramsMap: Map<string, string[]> } {
   const keys: string[] = [];
   const paramsMap = new Map<string, string[]>();

   for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'string') {
         keys.push(fullKey);

         // Extract parameters from {{param}} or {param}
         const paramMatches = value.match(/\{\{?(\w+)\}?\}/g);
         if (paramMatches) {
            const params = paramMatches.map((m) =>
               m.replace(/\{\{?|\}?\}/g, ''),
            );
            paramsMap.set(fullKey, params);
         }
      } else if (typeof value === 'object') {
         const nested = extractKeys(value, fullKey);
         keys.push(...nested.keys);
         nested.paramsMap.forEach((params, key) => {
            paramsMap.set(key, params);
         });
      }
   }

   return { keys, paramsMap };
}

function generateTypes() {
   const localesDir = path.join(__dirname, '../locales');
   const ruJsonPath = path.join(localesDir, 'ru.json');

   // Read Russian translations as base
   const translations: TranslationObject = JSON.parse(
      fs.readFileSync(ruJsonPath, 'utf-8'),
   );

   const { keys, paramsMap } = extractKeys(translations);

   const groupedKeys: { [category: string]: string[] } = {};

   keys.forEach((key) => {
      const category = key.split('.')[0];
      if (!groupedKeys[category]) {
         groupedKeys[category] = [];
      }
      groupedKeys[category].push(key);
   });

   let tsCode = `/**
 * Auto-generated TypeScript types for i18n translation keys
 * This ensures type-safety when using translation keys
 * 
 * Generated: ${new Date().toISOString()}
 * DO NOT EDIT MANUALLY - regenerate using: npm run i18n:generate-types
 */

`;

   Object.entries(groupedKeys).forEach(([category, categoryKeys]) => {
      const typeName = `${category.charAt(0).toUpperCase()}${category.slice(1)}Keys`;
      tsCode += `// ${category.charAt(0).toUpperCase()}${category.slice(1)} keys\n`;
      tsCode += `export type ${typeName} =\n`;
      tsCode += categoryKeys.map((key) => `   | '${key}'`).join('\n');
      tsCode += ';\n\n';
   });

   const categoryTypes = Object.keys(groupedKeys)
      .map((cat) => `${cat.charAt(0).toUpperCase()}${cat.slice(1)}Keys`)
      .join('\n   | ');

   tsCode += `// All translation keys combined\n`;
   tsCode += `export type TranslationKey =\n   | ${categoryTypes};\n\n`;

   tsCode += `/**
 * Parameters for each translation key
 * This ensures you pass the correct parameters when using translations
 */\n`;
   tsCode += `export interface TranslationParams {\n`;

   Array.from(paramsMap.entries()).forEach(([key, params]) => {
      if (params.length > 0) {
         const paramTypes = params
            .map((p) => {
               // Try to guess type from param name
               if (
                  p.includes('amount') ||
                  p.includes('price') ||
                  p.includes('count') ||
                  p.includes('balance') ||
                  p.includes('rating')
               ) {
                  return `${p}: number`;
               } else if (p.endsWith('?')) {
                  return `${p}: string | undefined`;
               } else {
                  return `${p}: string | number`;
               }
            })
            .join('; ');
         tsCode += `   '${key}': { ${paramTypes} };\n`;
      }
   });

   tsCode += `}\n\n`;

   tsCode += `// Keys that don't require parameters\n`;
   tsCode += `export type TranslationKeyWithoutParams = Exclude<\n`;
   tsCode += `   TranslationKey,\n`;
   tsCode += `   keyof TranslationParams\n`;
   tsCode += `>;\n\n`;

   tsCode += `// Keys that require parameters\n`;
   tsCode += `export type TranslationKeyWithParams = keyof TranslationParams;\n`;

   const typesPath = path.join(__dirname, '../types.ts');
   fs.writeFileSync(typesPath, tsCode, 'utf-8');

   console.log(`Generated types for ${keys.length} translation keys`);
   console.log(`Output: ${typesPath}`);
   console.log(`Categories: ${Object.keys(groupedKeys).join(', ')}`);
   console.log(`Keys with parameters: ${paramsMap.size}/${keys.length}`);
}

try {
   generateTypes();
} catch (error) {
   console.error('Error generating types:', error);
   process.exit(1);
}
