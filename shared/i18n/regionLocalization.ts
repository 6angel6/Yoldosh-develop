import { UserLanguage } from '../../src/user/models/User';

export const cityTranslations: Record<
   string,
   { uz: string; en: string; ru: string }
> = {
   Ташкент: { ru: 'Ташкент', uz: 'Toshkent', en: 'Tashkent' },
   Toshkent: { ru: 'Ташкент', uz: 'Toshkent', en: 'Tashkent' },
   Tashkent: { ru: 'Ташкент', uz: 'Toshkent', en: 'Tashkent' },

   // --- ТАШКЕНТСКАЯ ОБЛАСТЬ ---
   Чирчик: { ru: 'Чирчик', uz: 'Chirchiq', en: 'Chirchik' },
   Chirchiq: { ru: 'Чирчик', uz: 'Chirchiq', en: 'Chirchik' },
   Chirchik: { ru: 'Чирчик', uz: 'Chirchiq', en: 'Chirchik' },

   Ангрен: { ru: 'Ангрен', uz: 'Angren', en: 'Angren' },
   Angren: { ru: 'Ангрен', uz: 'Angren', en: 'Angren' },

   Алмалык: { ru: 'Алмалык', uz: 'Olmaliq', en: 'Almalyk' },
   Olmaliq: { ru: 'Алмалык', uz: 'Olmaliq', en: 'Almalyk' },
   Almalyk: { ru: 'Алмалык', uz: 'Olmaliq', en: 'Almalyk' },

   Бекабад: { ru: 'Бекабад', uz: 'Bekobod', en: 'Bekabad' },
   Bekobod: { ru: 'Бекабад', uz: 'Bekobod', en: 'Bekabad' },
   Bekabad: { ru: 'Бекабад', uz: 'Bekobod', en: 'Bekabad' },

   Янгиюль: { ru: 'Янгиюль', uz: "Yangiyo'l", en: 'Yangiyul' },
   "Yangiyo'l": { ru: 'Янгиюль', uz: "Yangiyo'l", en: 'Yangiyul' },
   Yangiyul: { ru: 'Янгиюль', uz: "Yangiyo'l", en: 'Yangiyul' },

   Ахангаран: { ru: 'Ахангаран', uz: 'Ohangaron', en: 'Akhangaran' },
   Ohangaron: { ru: 'Ахангаран', uz: 'Ohangaron', en: 'Akhangaran' },
   Akhangaran: { ru: 'Ахангаран', uz: 'Ohangaron', en: 'Akhangaran' },

   Нурафшан: { ru: 'Нурафшан', uz: 'Nurafshon', en: 'Nurafshan' },
   Nurafshon: { ru: 'Нурафшан', uz: 'Nurafshon', en: 'Nurafshan' },
   Nurafshan: { ru: 'Нурафшан', uz: 'Nurafshon', en: 'Nurafshan' },

   Газалкент: { ru: 'Газалкент', uz: "G'azalkent", en: 'Gazalkent' },
   "G'azalkent": { ru: 'Газалкент', uz: "G'azalkent", en: 'Gazalkent' },
   Gazalkent: { ru: 'Газалкент', uz: "G'azalkent", en: 'Gazalkent' },

   Паркент: { ru: 'Паркент', uz: 'Parkent', en: 'Parkent' },
   Parkent: { ru: 'Паркент', uz: 'Parkent', en: 'Parkent' },

   Пскент: { ru: 'Пскент', uz: 'Piskent', en: 'Pskent' },
   Piskent: { ru: 'Пскент', uz: 'Piskent', en: 'Pskent' },
   Pskent: { ru: 'Пскент', uz: 'Piskent', en: 'Pskent' },

   Чиназ: { ru: 'Чиназ', uz: 'Chinoz', en: 'Chinaz' },
   Chinoz: { ru: 'Чиназ', uz: 'Chinoz', en: 'Chinaz' },
   Chinaz: { ru: 'Чиназ', uz: 'Chinoz', en: 'Chinaz' },

   Бука: { ru: 'Бука', uz: "Bo'ka", en: 'Buka' },
   "Bo'ka": { ru: 'Бука', uz: "Bo'ka", en: 'Buka' },
   Buka: { ru: 'Бука', uz: "Bo'ka", en: 'Buka' },

   Келес: { ru: 'Келес', uz: 'Keles', en: 'Keles' },
   Keles: { ru: 'Келес', uz: 'Keles', en: 'Keles' },

   // --- АНДИЖАНСКАЯ ОБЛАСТЬ ---
   Андижан: { ru: 'Андижан', uz: 'Andijon', en: 'Andijan' },
   Andijon: { ru: 'Андижан', uz: 'Andijon', en: 'Andijan' },
   Andijan: { ru: 'Андижан', uz: 'Andijon', en: 'Andijan' },

   Асака: { ru: 'Асака', uz: 'Asaka', en: 'Asaka' },
   Asaka: { ru: 'Асака', uz: 'Asaka', en: 'Asaka' },

   Ханабад: { ru: 'Ханабад', uz: 'Xonobod', en: 'Khanabad' },
   Xonobod: { ru: 'Ханабад', uz: 'Xonobod', en: 'Khanabad' },
   Khanabad: { ru: 'Ханабад', uz: 'Xonobod', en: 'Khanabad' },

   Шахрихан: { ru: 'Шахрихан', uz: 'Shahrixon', en: 'Shahrikhan' },
   Shahrixon: { ru: 'Шахрихан', uz: 'Shahrixon', en: 'Shahrikhan' },
   Shahrikhan: { ru: 'Шахрихан', uz: 'Shahrixon', en: 'Shahrikhan' },

   Карасу: { ru: 'Карасу', uz: 'Qorasuv', en: 'Karasu' },
   Qorasuv: { ru: 'Карасу', uz: 'Qorasuv', en: 'Karasu' },
   Karasu: { ru: 'Карасу', uz: 'Qorasuv', en: 'Karasu' },

   Пайтуг: { ru: 'Пайтуг', uz: "Poytug'", en: 'Paytug' },
   "Poytug'": { ru: 'Пайтуг', uz: "Poytug'", en: 'Paytug' },
   Paytug: { ru: 'Пайтуг', uz: "Poytug'", en: 'Paytug' },

   Кургантепа: { ru: 'Кургантепа', uz: "Qo'rg'ontepa", en: 'Kurgantepa' },
   "Qo'rg'ontepa": { ru: 'Кургантепа', uz: "Qo'rg'ontepa", en: 'Kurgantepa' },
   Kurgantepa: { ru: 'Кургантепа', uz: "Qo'rg'ontepa", en: 'Kurgantepa' },

   Мархамат: { ru: 'Мархамат', uz: 'Marhamat', en: 'Marhamat' },
   Marhamat: { ru: 'Мархамат', uz: 'Marhamat', en: 'Marhamat' },

   // --- БУХАРСКАЯ ОБЛАСТЬ ---
   Бухара: { ru: 'Бухара', uz: 'Buxoro', en: 'Bukhara' },
   Buxoro: { ru: 'Бухара', uz: 'Buxoro', en: 'Bukhara' },
   Bukhara: { ru: 'Бухара', uz: 'Buxoro', en: 'Bukhara' },

   Каган: { ru: 'Каган', uz: 'Kogon', en: 'Kagan' },
   Kogon: { ru: 'Каган', uz: 'Kogon', en: 'Kagan' },
   Kagan: { ru: 'Каган', uz: 'Kogon', en: 'Kagan' },

   Гиждуван: { ru: 'Гиждуван', uz: "G'ijduvon", en: 'Gijduvan' },
   "G'ijduvon": { ru: 'Гиждуван', uz: "G'ijduvon", en: 'Gijduvan' },
   Gijduvan: { ru: 'Гиждуван', uz: "G'ijduvon", en: 'Gijduvan' },

   Шафиркан: { ru: 'Шафиркан', uz: 'Shofirkon', en: 'Shafirkan' },
   Shofirkon: { ru: 'Шафиркан', uz: 'Shofirkon', en: 'Shafirkan' },
   Shafirkan: { ru: 'Шафиркан', uz: 'Shofirkon', en: 'Shafirkan' },

   Вабкент: { ru: 'Вабкент', uz: 'Vobkent', en: 'Vabkent' },
   Vobkent: { ru: 'Вабкент', uz: 'Vobkent', en: 'Vabkent' },

   Газли: { ru: 'Газли', uz: 'Gazli', en: 'Gazli' },
   Gazli: { ru: 'Газли', uz: 'Gazli', en: 'Gazli' },

   Каракуль: { ru: 'Каракуль', uz: "Qorako'l", en: 'Karakul' },
   "Qorako'l": { ru: 'Каракуль', uz: "Qorako'l", en: 'Karakul' },
   Karakul: { ru: 'Каракуль', uz: "Qorako'l", en: 'Karakul' },

   Алат: { ru: 'Алат', uz: 'Olot', en: 'Alat' },
   Olot: { ru: 'Алат', uz: 'Olot', en: 'Alat' },
   Alat: { ru: 'Алат', uz: 'Olot', en: 'Alat' },

   Ромитан: { ru: 'Ромитан', uz: 'Romitan', en: 'Romitan' },
   Romitan: { ru: 'Ромитан', uz: 'Romitan', en: 'Romitan' },

   // --- ДЖИЗАКСКАЯ ОБЛАСТЬ ---
   Джизак: { ru: 'Джизак', uz: 'Jizzax', en: 'Jizzakh' },
   Jizzax: { ru: 'Джизак', uz: 'Jizzax', en: 'Jizzakh' },
   Jizzakh: { ru: 'Джизак', uz: 'Jizzax', en: 'Jizzakh' },

   Заамин: { ru: 'Заамин', uz: 'Zomin', en: 'Zaamin' },
   Zomin: { ru: 'Заамин', uz: 'Zomin', en: 'Zaamin' },
   Zaamin: { ru: 'Заамин', uz: 'Zomin', en: 'Zaamin' },

   Гагарин: { ru: 'Гагарин', uz: 'Gagarin', en: 'Gagarin' },
   Gagarin: { ru: 'Гагарин', uz: 'Gagarin', en: 'Gagarin' },

   Даштабад: { ru: 'Даштабад', uz: 'Dashtobod', en: 'Dashtabad' },
   Dashtobod: { ru: 'Даштабад', uz: 'Dashtobod', en: 'Dashtabad' },
   Dashtabad: { ru: 'Даштабад', uz: 'Dashtobod', en: 'Dashtabad' },

   Пахтакор: { ru: 'Пахтакор', uz: 'Paxtakor', en: 'Pakhtakor' },
   Paxtakor: { ru: 'Пахтакор', uz: 'Paxtakor', en: 'Pakhtakor' },
   Pakhtakor: { ru: 'Пахтакор', uz: 'Paxtakor', en: 'Pakhtakor' },

   Галляарал: { ru: 'Галляарал', uz: "G'allaorol", en: 'Gallaorol' },
   "G'allaorol": { ru: 'Галляарал', uz: "G'allaorol", en: 'Gallaorol' },
   Gallaorol: { ru: 'Галляарал', uz: "G'allaorol", en: 'Gallaorol' },

   // --- КАРШИНСКАЯ (КАШКАДАРЬИНСКАЯ) ОБЛАСТЬ ---
   Карши: { ru: 'Карши', uz: 'Qarshi', en: 'Karshi' },
   Qarshi: { ru: 'Карши', uz: 'Qarshi', en: 'Karshi' },
   Karshi: { ru: 'Карши', uz: 'Qarshi', en: 'Karshi' },

   Шахрисабз: { ru: 'Шахрисабз', uz: 'Shahrisabz', en: 'Shakhrisabz' },
   Shahrisabz: { ru: 'Шахрисабз', uz: 'Shahrisabz', en: 'Shakhrisabz' },
   Shakhrisabz: { ru: 'Шахрисабз', uz: 'Shahrisabz', en: 'Shakhrisabz' },

   Китаб: { ru: 'Китаб', uz: 'Kitob', en: 'Kitab' },
   Kitob: { ru: 'Китаб', uz: 'Kitob', en: 'Kitab' },
   Kitab: { ru: 'Китаб', uz: 'Kitob', en: 'Kitab' },

   Касан: { ru: 'Касан', uz: 'Koson', en: 'Kasan' },
   Koson: { ru: 'Касан', uz: 'Koson', en: 'Kasan' },
   Kasan: { ru: 'Касан', uz: 'Koson', en: 'Kasan' },

   Мубарек: { ru: 'Мубарек', uz: 'Muborak', en: 'Mubarek' },
   Muborak: { ru: 'Мубарек', uz: 'Muborak', en: 'Mubarek' },
   Mubarek: { ru: 'Мубарек', uz: 'Muborak', en: 'Mubarek' },

   Яккабаг: { ru: 'Яккабаг', uz: "Yakkabog'", en: 'Yakkabag' },
   "Yakkabog'": { ru: 'Яккабаг', uz: "Yakkabog'", en: 'Yakkabag' },
   Yakkabag: { ru: 'Яккабаг', uz: "Yakkabog'", en: 'Yakkabag' },

   Гузар: { ru: 'Гузар', uz: "G'uzor", en: 'Guzar' },
   "G'uzor": { ru: 'Гузар', uz: "G'uzor", en: 'Guzar' },
   Guzar: { ru: 'Гузар', uz: "G'uzor", en: 'Guzar' },

   Камаши: { ru: 'Камаши', uz: 'Qamashi', en: 'Kamashi' },
   Qamashi: { ru: 'Камаши', uz: 'Qamashi', en: 'Kamashi' },
   Kamashi: { ru: 'Камаши', uz: 'Qamashi', en: 'Kamashi' },

   Чиракчи: { ru: 'Чиракчи', uz: 'Chiroqchi', en: 'Chiroqchi' },
   Chiroqchi: { ru: 'Чиракчи', uz: 'Chiroqchi', en: 'Chiroqchi' },
   Chirakchi: { ru: 'Чиракчи', uz: 'Chiroqchi', en: 'Chiroqchi' },

   Бешкент: { ru: 'Бешкент', uz: 'Beshkent', en: 'Beshkent' },
   Beshkent: { ru: 'Бешкент', uz: 'Beshkent', en: 'Beshkent' },

   // --- НАВОИЙСКАЯ ОБЛАСТЬ ---
   Навои: { ru: 'Навои', uz: 'Navoiy', en: 'Navoi' },
   Navoiy: { ru: 'Навои', uz: 'Navoiy', en: 'Navoi' },
   Navoi: { ru: 'Навои', uz: 'Navoiy', en: 'Navoi' },

   Зарафшан: { ru: 'Зарафшан', uz: 'Zarafshon', en: 'Zarafshan' },
   Zarafshon: { ru: 'Зарафшан', uz: 'Zarafshon', en: 'Zarafshan' },
   Zarafshan: { ru: 'Зарафшан', uz: 'Zarafshon', en: 'Zarafshan' },

   Учкудук: { ru: 'Учкудук', uz: 'Uchquduq', en: 'Uchkuduk' },
   Uchquduq: { ru: 'Учкудук', uz: 'Uchquduq', en: 'Uchkuduk' },
   Uchkuduk: { ru: 'Учкудук', uz: 'Uchquduq', en: 'Uchkuduk' },

   Нурата: { ru: 'Нурата', uz: 'Nurota', en: 'Nurata' },
   Nurota: { ru: 'Нурата', uz: 'Nurota', en: 'Nurata' },
   Nurata: { ru: 'Нурата', uz: 'Nurota', en: 'Nurata' },

   Кызылтепа: { ru: 'Кызылтепа', uz: 'Qiziltepa', en: 'Kyzyltepa' },
   Qiziltepa: { ru: 'Кызылтепа', uz: 'Qiziltepa', en: 'Kyzyltepa' },
   Kyzyltepa: { ru: 'Кызылтепа', uz: 'Qiziltepa', en: 'Kyzyltepa' },

   Янгирабат: { ru: 'Янгирабат', uz: 'Yangirabod', en: 'Yangirabat' },
   Yangirabod: { ru: 'Янгирабат', uz: 'Yangirabod', en: 'Yangirabat' },
   Yangirabat: { ru: 'Янгирабат', uz: 'Yangirabod', en: 'Yangirabat' },

   // --- НАМАНГАНСКАЯ ОБЛАСТЬ ---
   Наманган: { ru: 'Наманган', uz: 'Namangan', en: 'Namangan' },
   Namangan: { ru: 'Наманган', uz: 'Namangan', en: 'Namangan' },

   Чуст: { ru: 'Чуст', uz: 'Chust', en: 'Chust' },
   Chust: { ru: 'Чуст', uz: 'Chust', en: 'Chust' },

   Чартак: { ru: 'Чартак', uz: 'Chortoq', en: 'Chartak' },
   Chortoq: { ru: 'Чартак', uz: 'Chortoq', en: 'Chartak' },
   Chartak: { ru: 'Чартак', uz: 'Chortoq', en: 'Chartak' },

   Касансай: { ru: 'Касансай', uz: 'Kosonsoy', en: 'Kasansay' },
   Kosonsoy: { ru: 'Касансай', uz: 'Kosonsoy', en: 'Kasansay' },
   Kasansay: { ru: 'Касансай', uz: 'Kosonsoy', en: 'Kasansay' },

   Учкурган: { ru: 'Учкурган', uz: "Uchqo'rg'on", en: 'Uchkurgan' },
   "Uchqo'rg'on": { ru: 'Учкурган', uz: "Uchqo'rg'on", en: 'Uchkurgan' },
   Uchkurgan: { ru: 'Учкурган', uz: "Uchqo'rg'on", en: 'Uchkurgan' },

   Туракурган: { ru: 'Туракурган', uz: "To'raqo'rg'on", en: 'Turakurgan' },
   "To'raqo'rg'on": { ru: 'Туракурган', uz: "To'raqo'rg'on", en: 'Turakurgan' },
   Turakurgan: { ru: 'Туракурган', uz: "To'raqo'rg'on", en: 'Turakurgan' },

   Хаккулабад: { ru: 'Хаккулабад', uz: 'Haqqulobod', en: 'Hakkulabad' },
   Haqqulobod: { ru: 'Хаккулабад', uz: 'Haqqulobod', en: 'Hakkulabad' },
   Hakkulabad: { ru: 'Хаккулабад', uz: 'Haqqulobod', en: 'Hakkulabad' },

   Пап: { ru: 'Пап', uz: 'Pop', en: 'Pap' },
   Pop: { ru: 'Пап', uz: 'Pop', en: 'Pap' },
   Pap: { ru: 'Пап', uz: 'Pop', en: 'Pap' },

   // --- САМАРКАНДСКАЯ ОБЛАСТЬ ---
   Самарканд: { ru: 'Самарканд', uz: 'Samarqand', en: 'Samarkand' },
   Samarqand: { ru: 'Самарканд', uz: 'Samarqand', en: 'Samarkand' },
   Samarkand: { ru: 'Самарканд', uz: 'Samarqand', en: 'Samarkand' },

   Каттакурган: { ru: 'Каттакурган', uz: "Kattaqo'rg'on", en: 'Kattakurgan' },
   "Kattaqo'rg'on": {
      ru: 'Каттакурган',
      uz: "Kattaqo'rg'on",
      en: 'Kattakurgan',
   },
   Kattakurgan: { ru: 'Каттакурган', uz: "Kattaqo'rg'on", en: 'Kattakurgan' },

   Ургут: { ru: 'Ургут', uz: 'Urgut', en: 'Urgut' },
   Urgut: { ru: 'Ургут', uz: 'Urgut', en: 'Urgut' },

   Джума: { ru: 'Джума', uz: 'Juma', en: 'Juma' },
   Juma: { ru: 'Джума', uz: 'Juma', en: 'Juma' },

   Акташ: { ru: 'Акташ', uz: 'Oqtosh', en: 'Aktash' },
   Oqtosh: { ru: 'Акташ', uz: 'Oqtosh', en: 'Aktash' },
   Aktash: { ru: 'Акташ', uz: 'Oqtosh', en: 'Aktash' },

   Булунгур: { ru: 'Булунгур', uz: "Bulung'ur", en: 'Bulungur' },
   "Bulung'ur": { ru: 'Булунгур', uz: "Bulung'ur", en: 'Bulungur' },
   Bulungur: { ru: 'Булунгур', uz: "Bulung'ur", en: 'Bulungur' },

   Челек: { ru: 'Челек', uz: 'Chelak', en: 'Chelak' },
   Chelak: { ru: 'Челек', uz: 'Chelak', en: 'Chelak' },

   Джамбай: { ru: 'Джамбай', uz: 'Jomboy', en: 'Jomboy' },
   Jomboy: { ru: 'Джамбай', uz: 'Jomboy', en: 'Jomboy' },

   Пайарык: { ru: 'Пайарык', uz: 'Payariq', en: 'Payariq' },
   Payariq: { ru: 'Пайарык', uz: 'Payariq', en: 'Payariq' },

   Нурабад: { ru: 'Нурабад', uz: 'Nurobod', en: 'Nurabad' },
   Nurobod: { ru: 'Нурабад', uz: 'Nurobod', en: 'Nurabad' },
   Nurabad: { ru: 'Нурабад', uz: 'Nurobod', en: 'Nurabad' },

   // --- СУРХАНДАРЬИНСКАЯ ОБЛАСТЬ ---
   Термез: { ru: 'Термез', uz: 'Termiz', en: 'Termez' },
   Termiz: { ru: 'Термез', uz: 'Termiz', en: 'Termez' },
   Termez: { ru: 'Термез', uz: 'Termiz', en: 'Termez' },

   Денау: { ru: 'Денау', uz: 'Denov', en: 'Denau' },
   Denov: { ru: 'Денау', uz: 'Denov', en: 'Denau' },
   Denau: { ru: 'Денау', uz: 'Denov', en: 'Denau' },

   Шерабад: { ru: 'Шерабад', uz: 'Sherobod', en: 'Sherabad' },
   Sherobod: { ru: 'Шерабад', uz: 'Sherobod', en: 'Sherabad' },
   Sherabad: { ru: 'Шерабад', uz: 'Sherobod', en: 'Sherabad' },

   Байсун: { ru: 'Байсун', uz: 'Boysun', en: 'Baysun' },
   Boysun: { ru: 'Байсун', uz: 'Boysun', en: 'Baysun' },
   Baysun: { ru: 'Байсун', uz: 'Boysun', en: 'Baysun' },

   Шурчи: { ru: 'Шурчи', uz: "Sho'rchi", en: 'Shurchi' },
   "Sho'rchi": { ru: 'Шурчи', uz: "Sho'rchi", en: 'Shurchi' },
   Shurchi: { ru: 'Шурчи', uz: "Sho'rchi", en: 'Shurchi' },

   Джаркурган: { ru: 'Джаркурган', uz: "Jarqo'rg'on", en: 'Jarkurgan' },
   "Jarqo'rg'on": { ru: 'Джаркурган', uz: "Jarqo'rg'on", en: 'Jarkurgan' },
   Jarkurgan: { ru: 'Джаркурган', uz: "Jarqo'rg'on", en: 'Jarkurgan' },

   Кумкурган: { ru: 'Кумкурган', uz: "Qumqo'rg'on", en: 'Kumkurgan' },
   "Qumqo'rg'on": { ru: 'Кумкурган', uz: "Qumqo'rg'on", en: 'Kumkurgan' },
   Kumkurgan: { ru: 'Кумкурган', uz: "Qumqo'rg'on", en: 'Kumkurgan' },

   Шаргунь: { ru: 'Шаргунь', uz: 'Shargun', en: 'Shargun' },
   Shargun: { ru: 'Шаргунь', uz: 'Shargun', en: 'Shargun' },

   // --- СЫРДАРЬИНСКАЯ ОБЛАСТЬ ---
   Гулистан: { ru: 'Гулистан', uz: 'Guliston', en: 'Gulistan' },
   Guliston: { ru: 'Гулистан', uz: 'Guliston', en: 'Gulistan' },
   Gulistan: { ru: 'Гулистан', uz: 'Guliston', en: 'Gulistan' },

   Янгиер: { ru: 'Янгиер', uz: 'Yangiyer', en: 'Yangiyer' },
   Yangiyer: { ru: 'Янгиер', uz: 'Yangiyer', en: 'Yangiyer' },

   Ширин: { ru: 'Ширин', uz: 'Shirin', en: 'Shirin' },
   Shirin: { ru: 'Ширин', uz: 'Shirin', en: 'Shirin' },

   Бахт: { ru: 'Бахт', uz: 'Baxt', en: 'Bakht' },
   Baxt: { ru: 'Бахт', uz: 'Baxt', en: 'Bakht' },
   Bakht: { ru: 'Бахт', uz: 'Baxt', en: 'Bakht' },

   Сырдарья: { ru: 'Сырдарья', uz: 'Sirdaryo', en: 'Syrdarya' },
   Sirdaryo: { ru: 'Сырдарья', uz: 'Sirdaryo', en: 'Syrdarya' },
   Syrdarya: { ru: 'Сырдарья', uz: 'Sirdaryo', en: 'Syrdarya' },

   // --- ФЕРГАНСКАЯ ОБЛАСТЬ ---
   Фергана: { ru: 'Фергана', uz: "Farg'ona", en: 'Fergana' },
   "Farg'ona": { ru: 'Фергана', uz: "Farg'ona", en: 'Fergana' },
   Fergana: { ru: 'Фергана', uz: "Farg'ona", en: 'Fergana' },

   Коканд: { ru: 'Коканд', uz: "Qo'qon", en: 'Kokand' },
   "Qo'qon": { ru: 'Коканд', uz: "Qo'qon", en: 'Kokand' },
   Kokand: { ru: 'Коканд', uz: "Qo'qon", en: 'Kokand' },

   Маргилан: { ru: 'Маргилан', uz: "Marg'ilon", en: 'Margilan' },
   "Marg'ilon": { ru: 'Маргилан', uz: "Marg'ilon", en: 'Margilan' },
   Margilan: { ru: 'Маргилан', uz: "Marg'ilon", en: 'Margilan' },

   Кувасай: { ru: 'Кувасай', uz: 'Quvasoy', en: 'Kuvasay' },
   Quvasoy: { ru: 'Кувасай', uz: 'Quvasoy', en: 'Kuvasay' },
   Kuvasay: { ru: 'Кувасай', uz: 'Quvasoy', en: 'Kuvasay' },

   Риштан: { ru: 'Риштан', uz: 'Rishton', en: 'Rishtan' },
   Rishton: { ru: 'Риштан', uz: 'Rishton', en: 'Rishtan' },
   Rishtan: { ru: 'Риштан', uz: 'Rishton', en: 'Rishtan' },

   Яйпан: { ru: 'Яйпан', uz: 'Yaypan', en: 'Yaypan' },
   Yaypan: { ru: 'Яйпан', uz: 'Yaypan', en: 'Yaypan' },

   Кува: { ru: 'Кува', uz: 'Quva', en: 'Kuva' },
   Quva: { ru: 'Кува', uz: 'Quva', en: 'Kuva' },
   Kuva: { ru: 'Кува', uz: 'Quva', en: 'Kuva' },

   Бешарык: { ru: 'Бешарык', uz: 'Beshariq', en: 'Besharyk' },
   Beshariq: { ru: 'Бешарык', uz: 'Beshariq', en: 'Besharyk' },
   Besharyk: { ru: 'Бешарык', uz: 'Beshariq', en: 'Besharyk' },

   Хамза: { ru: 'Хамза', uz: 'Hamza', en: 'Hamza' },
   Hamza: { ru: 'Хамза', uz: 'Hamza', en: 'Hamza' },

   // --- ХОРЕЗМСКАЯ ОБЛАСТЬ ---
   Ургенч: { ru: 'Ургенч', uz: 'Urganch', en: 'Urgench' },
   Urganch: { ru: 'Ургенч', uz: 'Urganch', en: 'Urgench' },
   Urgench: { ru: 'Ургенч', uz: 'Urganch', en: 'Urgench' },

   Хива: { ru: 'Хива', uz: 'Xiva', en: 'Khiva' },
   Xiva: { ru: 'Хива', uz: 'Xiva', en: 'Khiva' },
   Khiva: { ru: 'Хива', uz: 'Xiva', en: 'Khiva' },

   Шават: { ru: 'Шават', uz: 'Shovot', en: 'Shavat' },
   Shovot: { ru: 'Шават', uz: 'Shovot', en: 'Shavat' },
   Shavat: { ru: 'Шават', uz: 'Shovot', en: 'Shavat' },

   Питнак: { ru: 'Питнак', uz: 'Pitnak', en: 'Pitnak' },
   Pitnak: { ru: 'Питнак', uz: 'Pitnak', en: 'Pitnak' },

   Ханка: { ru: 'Ханка', uz: 'Xonqa', en: 'Khanka' },
   Xonqa: { ru: 'Ханка', uz: 'Xonqa', en: 'Khanka' },
   Khanka: { ru: 'Ханка', uz: 'Xonqa', en: 'Khanka' },

   Гурлен: { ru: 'Гурлен', uz: 'Gurlan', en: 'Gurlen' },
   Gurlan: { ru: 'Гурлен', uz: 'Gurlan', en: 'Gurlen' },
   Gurlen: { ru: 'Гурлен', uz: 'Gurlan', en: 'Gurlen' },

   Кошкупыр: { ru: 'Кошкупыр', uz: "Qo'shko'pir", en: 'Koshkupir' },
   "Qo'shko'pir": { ru: 'Кошкупыр', uz: "Qo'shko'pir", en: 'Koshkupir' },
   Koshkupir: { ru: 'Кошкупыр', uz: "Qo'shko'pir", en: 'Koshkupir' },

   // --- РЕСПУБЛИКА КАРАКАЛПАКСТАН ---
   Нукус: { ru: 'Нукус', uz: 'Nukus', en: 'Nukus' },
   Nukus: { ru: 'Нукус', uz: 'Nukus', en: 'Nukus' },

   Кунград: { ru: 'Кунград', uz: "Qo'ng'irot", en: 'Kungrad' },
   "Qo'ng'irot": { ru: 'Кунград', uz: "Qo'ng'irot", en: 'Kungrad' },
   Kungrad: { ru: 'Кунград', uz: "Qo'ng'irot", en: 'Kungrad' },

   Беруни: { ru: 'Беруни', uz: 'Beruniy', en: 'Beruniy' },
   Beruniy: { ru: 'Беруни', uz: 'Beruniy', en: 'Beruniy' },

   Турткуль: { ru: 'Турткуль', uz: "To'rtko'l", en: 'Turtkul' },
   "To'rtko'l": { ru: 'Турткуль', uz: "To'rtko'l", en: 'Turtkul' },
   Turtkul: { ru: 'Турткуль', uz: "To'rtko'l", en: 'Turtkul' },

   Ходжейли: { ru: 'Ходжейли', uz: "Xo'jayli", en: 'Khodjeyli' },
   "Xo'jayli": { ru: 'Ходжейли', uz: "Xo'jayli", en: 'Khodjeyli' },
   Khodjeyli: { ru: 'Ходжейли', uz: "Xo'jayli", en: 'Khodjeyli' },

   Чимбай: { ru: 'Чимбай', uz: 'Chimboy', en: 'Chimbay' },
   Chimboy: { ru: 'Чимбай', uz: 'Chimboy', en: 'Chimbay' },
   Chimbay: { ru: 'Чимбай', uz: 'Chimboy', en: 'Chimbay' },

   Муйнак: { ru: 'Муйнак', uz: "Mo'ynoq", en: 'Muynak' },
   "Mo'ynoq": { ru: 'Муйнак', uz: "Mo'ynoq", en: 'Muynak' },
   Muynak: { ru: 'Муйнак', uz: "Mo'ynoq", en: 'Muynak' },

   Тахиаташ: { ru: 'Тахиаташ', uz: 'Taxiatosh', en: 'Takhiatash' },
   Taxiatosh: { ru: 'Тахиаташ', uz: 'Taxiatosh', en: 'Takhiatash' },
   Takhiatash: { ru: 'Тахиаташ', uz: 'Taxiatosh', en: 'Takhiatash' },

   Мангит: { ru: 'Мангит', uz: "Mang'it", en: 'Manghit' },
   "Mang'it": { ru: 'Мангит', uz: "Mang'it", en: 'Manghit' },
   Manghit: { ru: 'Мангит', uz: "Mang'it", en: 'Manghit' },

   Шуманай: { ru: 'Шуманай', uz: 'Shumanay', en: 'Shumanay' },
   Shumanay: { ru: 'Шуманай', uz: 'Shumanay', en: 'Shumanay' },

   Халкабад: { ru: 'Халкабад', uz: 'Xalqobod', en: 'Khalkabad' },
   Xalqobod: { ru: 'Халкабад', uz: 'Xalqobod', en: 'Khalkabad' },
   Khalkabad: { ru: 'Халкабад', uz: 'Xalqobod', en: 'Khalkabad' },

   Канлыкуль: { ru: 'Канлыкуль', uz: "Qonliko'l", en: 'Kanlykul' },
   "Qonliko'l": { ru: 'Канлыкуль', uz: "Qonliko'l", en: 'Kanlykul' },
   Kanlykul: { ru: 'Канлыкуль', uz: "Qonliko'l", en: 'Kanlykul' },

   Кегейли: { ru: 'Кегейли', uz: 'Kegeyli', en: 'Kegeyli' },
   Kegeyli: { ru: 'Кегейли', uz: 'Kegeyli', en: 'Kegeyli' },
};

/**
 * Возвращает русское каноничное имя города для заданного ввода (любой из
 * трёх вариантов — ru/uz/en), если он есть в cityTranslations. Иначе null.
 *
 * Используется перед запросом к Яндекс.Геокодеру: для узбекских городов
 * Яндекс надёжнее отвечает на русский запрос ("Хива"), а на латинский
 * ("Xiva") топ результатов часто забит улицами с тем же именем.
 */
export const getRussianCanonicalCityName = (rawCity: string): string | null => {
   const trimmed = rawCity.trim();
   if (!trimmed) return null;

   if (cityTranslations[trimmed]) {
      return cityTranslations[trimmed].ru;
   }

   const lowerTrimmed = trimmed.toLowerCase();
   for (const key of Object.keys(cityTranslations)) {
      if (key.toLowerCase() === lowerTrimmed) {
         return cityTranslations[key].ru;
      }
   }

   return null;
};

/**
 * Нормализует название города: ищет в cityTranslations по точному совпадению
 * или нечёткому (contains/case-insensitive), возвращает каноничный узбекский вариант.
 * Если не нашёл — возвращает оригинал без изменений.
 *
 * Nominatim может вернуть "Toshkent shahri", "Samarqand", "Farg'ona" и т.д.
 * Эта функция приводит их к каноничному виду из маппинга.
 */
export const normalizeCityName = (rawCity: string): string => {
   const trimmed = rawCity.trim();
   if (!trimmed) return trimmed;

   if (cityTranslations[trimmed]) {
      return cityTranslations[trimmed].uz;
   }

   const lowerTrimmed = trimmed.toLowerCase();
   for (const key of Object.keys(cityTranslations)) {
      if (key.toLowerCase() === lowerTrimmed) {
         return cityTranslations[key].uz;
      }
   }

   // 3. Nominatim часто добавляет суффиксы: "Toshkent shahri", "Samarqand shahri"
   //    Убираем типичные суффиксы и пробуем снова
   const suffixes = [
      ' shahri',
      ' tumani',
      ' viloyati',
      ' город',
      ' район',
      ' область',
      ' city',
      ' district',
      ' region',
      ' province',
   ];
   for (const suffix of suffixes) {
      if (lowerTrimmed.endsWith(suffix)) {
         const base = trimmed.slice(0, -suffix.length).trim();
         if (cityTranslations[base]) {
            return cityTranslations[base].uz;
         }
         for (const key of Object.keys(cityTranslations)) {
            if (key.toLowerCase() === base.toLowerCase()) {
               return cityTranslations[key].uz;
            }
         }
      }
   }

   // 4. Проверяем, содержится ли известный город в строке (для длинных адресов)
   for (const key of Object.keys(cityTranslations)) {
      if (key.length >= 3 && lowerTrimmed.includes(key.toLowerCase())) {
         return cityTranslations[key].uz;
      }
   }

   return trimmed;
};

export const getLocalizedCityName = (
   cityName: string | null | undefined,
   language: UserLanguage = UserLanguage.Russian,
): string => {
   if (!cityName) {
      return '';
   }

   const translation = cityTranslations[cityName];

   if (translation) {
      switch (language) {
         case UserLanguage.Uzbek:
            return translation.uz;
         case UserLanguage.English:
            return translation.en;
         case UserLanguage.Russian:
         default:
            return translation.ru;
      }
   }

   return cityName;
};

export const formatLocalizedLocation = (
   location: {
      address: string;
      city?: string;
      coordinates: { latitude: number; longitude: number };
   },
   language: UserLanguage = UserLanguage.Russian,
) => {
   return {
      address: location.address,
      city: getLocalizedCityName(location.city, language),
      coordinates: location.coordinates,
   };
};

export default {
   getLocalizedCityName,
   formatLocalizedLocation,
};
