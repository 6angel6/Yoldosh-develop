// generate_users.js
const fs = require('fs');
const { faker } = require('@faker-js/faker');

const stream = fs.createWriteStream('users.csv');
// Заголовки (Artillery skipHeader: true их пропустит, но для наглядности оставим)
stream.write('phoneNumber,firstName\n');

for (let i = 0; i < 50000; i++) {
    // Генерируем узбекские номера, чтобы проходить валидацию
    const phone = `+99890${String(i).padStart(7, '0')}`;
    const name = faker.person.firstName();
    stream.write(`${phone},${name}\n`);
}

stream.end();
console.log('users.csv generated with 50k users');