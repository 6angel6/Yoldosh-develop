'use strict';

/**
 * Миграция: нормализация from_city / to_city в таблице trips.
 *
 * Проблема: трипы, импортированные через Python-парсер (Nominatim),
 * сохранялись с названиями городов вроде "Toshkent shahri", "Samarqand" и т.д.,
 * а поиск (Yandex) ищет по "Ташкент", "Самарканд" — через cityTranslations.
 * Из-за несовпадения поиск не находил импортированные трипы.
 *
 * Решение: приводим все from_city и to_city к каноничному узбекскому варианту (uz)
 * из cityTranslations, чтобы getCityNameVariants() в поиске находил все варианты.
 */

// Каноничный маппинг: ключ (возможный вариант) → значение (uz каноничное)
// Собран из cityTranslations в regionLocalization.ts
const cityMapping = {
   // ТАШКЕНТ
   'Ташкент': 'Toshkent',
   'Tashkent': 'Toshkent',
   'Toshkent shahri': 'Toshkent',
   // ЧИРЧИК
   'Чирчик': 'Chirchiq',
   'Chirchik': 'Chirchiq',
   'Chirchiq shahri': 'Chirchiq',
   // АНГРЕН
   'Ангрен': 'Angren',
   'Angren shahri': 'Angren',
   // АЛМАЛЫК
   'Алмалык': 'Olmaliq',
   'Almalyk': 'Olmaliq',
   'Olmaliq shahri': 'Olmaliq',
   // БЕКАБАД
   'Бекабад': 'Bekobod',
   'Bekabad': 'Bekobod',
   'Bekobod shahri': 'Bekobod',
   // ЯНГИЮЛЬ
   'Янгиюль': 'Yangiyo\'l',
   'Yangiyul': 'Yangiyo\'l',
   // АХАНГАРАН
   'Ахангаран': 'Ohangaron',
   'Akhangaran': 'Ohangaron',
   // НУРАФШАН
   'Нурафшан': 'Nurafshon',
   'Nurafshan': 'Nurafshon',
   // ГАЗАЛКЕНТ
   'Газалкент': 'G\'azalkent',
   'Gazalkent': 'G\'azalkent',
   // ПАРКЕНТ
   'Паркент': 'Parkent',
   // ПСКЕНТ
   'Пскент': 'Piskent',
   'Pskent': 'Piskent',
   // ЧИНАЗ
   'Чиназ': 'Chinoz',
   'Chinaz': 'Chinoz',
   // БУКА
   'Бука': 'Bo\'ka',
   'Buka': 'Bo\'ka',
   // КЕЛЕС
   'Келес': 'Keles',
   // АНДИЖАН
   'Андижан': 'Andijon',
   'Andijan': 'Andijon',
   'Andijon shahri': 'Andijon',
   // АСАКА
   'Асака': 'Asaka',
   // ХАНАБАД
   'Ханабад': 'Xonobod',
   'Khanabad': 'Xonobod',
   // ШАХРИХАН
   'Шахрихан': 'Shahrixon',
   'Shahrikhan': 'Shahrixon',
   // КАРАСУ
   'Карасу': 'Qorasuv',
   'Karasu': 'Qorasuv',
   // БУХАРА
   'Бухара': 'Buxoro',
   'Bukhara': 'Buxoro',
   'Buxoro shahri': 'Buxoro',
   // КАГАН
   'Каган': 'Kogon',
   'Kagan': 'Kogon',
   // ДЖИЗАК
   'Джизак': 'Jizzax',
   'Jizzakh': 'Jizzax',
   'Jizzax shahri': 'Jizzax',
   // КАШКАДАРЬЯ / КАРШИ
   'Карши': 'Qarshi',
   'Karshi': 'Qarshi',
   'Qarshi shahri': 'Qarshi',
   // ШАХРИСАБЗ
   'Шахрисабз': 'Shahrisabz',
   'Shahrisabz shahri': 'Shahrisabz',
   // НАВОИ
   'Навои': 'Navoiy',
   'Navoi': 'Navoiy',
   'Navoiy shahri': 'Navoiy',
   // ЗАРАФШАН
   'Зарафшан': 'Zarafshon',
   'Zarafshan': 'Zarafshon',
   // УЧКУДУК
   'Учкудук': 'Uchquduq',
   'Uchkuduk': 'Uchquduq',
   // НАМАНГАН
   'Наманган': 'Namangan',
   'Namangan shahri': 'Namangan',
   // ЧУСТ
   'Чуст': 'Chust',
   // ПОП
   'Поп': 'Pop',
   // САМАРКАНД
   'Самарканд': 'Samarqand',
   'Samarkand': 'Samarqand',
   'Samarqand shahri': 'Samarqand',
   // КАТТАКУРГАН
   'Каттакурган': 'Kattaqo\'rg\'on',
   'Kattakurgan': 'Kattaqo\'rg\'on',
   // УРГУТ
   'Ургут': 'Urgut',
   // СЫРДАРЬЯ / ГУЛИСТАН
   'Гулистан': 'Guliston',
   'Gulistan': 'Guliston',
   'Guliston shahri': 'Guliston',
   // ШИРИН
   'Ширин': 'Shirin',
   // СУРХАНДАРЬЯ / ТЕРМЕЗ
   'Термез': 'Termiz',
   'Termez': 'Termiz',
   'Termiz shahri': 'Termiz',
   // ДЕНАУ
   'Денау': 'Denov',
   'Denau': 'Denov',
   // ФЕРГАНА
   'Фергана': 'Farg\'ona',
   'Fergana': 'Farg\'ona',
   'Farg\'ona shahri': 'Farg\'ona',
   // КОКАНД
   'Коканд': 'Qo\'qon',
   'Kokand': 'Qo\'qon',
   // МАРГИЛАН
   'Маргилан': 'Marg\'ilon',
   'Margilan': 'Marg\'ilon',
   // КУВАСАЙ
   'Кувасай': 'Quvasoy',
   'Kuvasay': 'Quvasoy',
   // РИШТАН
   'Риштан': 'Rishton',
   'Rishtan': 'Rishton',
   // ХОРЕЗМ / УРГЕНЧ
   'Ургенч': 'Urganch',
   'Urgench': 'Urganch',
   'Urganch shahri': 'Urganch',
   // ХИВА
   'Хива': 'Xiva',
   'Khiva': 'Xiva',
   // НУКУС
   'Нукус': 'Nukus',
   'Nukus shahri': 'Nukus',
   // КУНГРАД
   'Кунград': 'Qo\'ng\'irot',
   'Kungrad': 'Qo\'ng\'irot',
   // БЕРУНИ
   'Беруни': 'Beruniy',
   // ТУРТКУЛЬ
   'Турткуль': 'To\'rtko\'l',
   'Turtkul': 'To\'rtko\'l',
   // ХОДЖЕЙЛИ
   'Ходжейли': 'Xo\'jayli',
   'Khodjeyli': 'Xo\'jayli',
   // ЧИМБАЙ
   'Чимбай': 'Chimboy',
   'Chimbay': 'Chimboy',
   // МУЙНАК
   'Муйнак': 'Mo\'ynoq',
   'Muynak': 'Mo\'ynoq',
   // ТАХИАТАШ
   'Тахиаташ': 'Taxiatosh',
   'Takhiatash': 'Taxiatosh',
   // МАНГИТ
   'Мангит': 'Mang\'it',
   'Manghit': 'Mang\'it',
   // ШУМАНАЙ
   'Шуманай': 'Shumanay',
   // ХАЛКАБАД
   'Халкабад': 'Xalqobod',
   'Khalkabad': 'Xalqobod',
   // КАНЛЫКУЛЬ
   'Канлыкуль': 'Qonliko\'l',
   'Kanlykul': 'Qonliko\'l',
   // КЕГЕЙЛИ
   'Кегейли': 'Kegeyli',
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
   async up(queryInterface) {
      // Строим SQL CASE для нормализации
      const buildCase = (column) => {
         const whens = Object.entries(cityMapping)
            .map(([from, to]) => {
               const escapedFrom = from.replace(/'/g, "''");
               const escapedTo = to.replace(/'/g, "''");
               return `WHEN LOWER(TRIM(${column})) = LOWER('${escapedFrom}') THEN '${escapedTo}'`;
            })
            .join('\n            ');

         return `CASE\n            ${whens}\n            ELSE ${column}\n         END`;
      };

      // Обновляем from_city
      await queryInterface.sequelize.query(`
         UPDATE trips
         SET from_city = ${buildCase('from_city')}
         WHERE from_city IS NOT NULL;
      `);

      // Обновляем to_city
      await queryInterface.sequelize.query(`
         UPDATE trips
         SET to_city = ${buildCase('to_city')}
         WHERE to_city IS NOT NULL;
      `);
   },

   async down() {
      // Обратная миграция невозможна — оригинальные названия не сохранены.
      // Города уже нормализованы и остаются в каноничном виде.
      console.log(
         'Down migration skipped: city names normalization is not reversible.',
      );
   },
};
