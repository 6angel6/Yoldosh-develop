// processor.js
const { faker } = require('@faker-js/faker'); // Убедись, что установлен: npm i @faker-js/faker

function generateTripData(requestParams, ctx, ee, next) {
    // 1. Генерируем случайные координаты вокруг Ташкента
    // Это заставит PostGIS реально работать, вычисляя расстояния
    ctx.vars.fromLat = faker.location.latitude({ max: 41.35, min: 41.20 });
    ctx.vars.fromLng = faker.location.longitude({ max: 69.35, min: 69.15 });

    ctx.vars.toLat = faker.location.latitude({ max: 39.70, min: 39.60 }); // Самарканд
    ctx.vars.toLng = faker.location.longitude({ max: 67.00, min: 66.90 });

    // 2. Дата отправления: "Завтра" + случайное время
    const date = new Date();
    date.setDate(date.getDate() + 1); // Завтра
    date.setHours(10 + Math.floor(Math.random() * 10)); // 10:00 - 20:00
    ctx.vars.departureTime = date.toISOString();

    // 3. Данные машины (чтобы каждый раз была разная, если нужно)
    ctx.vars.carModel = faker.vehicle.model();
    ctx.vars.carNumber = `01${faker.string.alpha({ length: 3, casing: 'upper' })}${faker.number.int({ min: 100, max: 999 })}`;

    // 4. Normalize phoneNumber from CSV — ensure it's a string and starts with '+'
    if (ctx.vars.phoneNumber !== undefined && ctx.vars.phoneNumber !== null) {
        let ph = String(ctx.vars.phoneNumber).trim();
        // Remove surrounding quotes if any
        ph = ph.replace(/^"|"$/g, '');
        // If plus is missing, add it
        if (!ph.startsWith('+')) {
            ph = '+' + ph.replace(/^\+?/, '');
        }
        ctx.vars.phoneNumber = ph;
    }

    return next();
}

module.exports = {
    generateTripData
};