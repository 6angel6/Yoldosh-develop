# ================================
# STAGE 1: Builder
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# build deps (для node-gyp)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci --ignore-scripts && npm cache clean --force

COPY . .

RUN npm run build


# ================================
# STAGE 2: Production
# ================================
FROM node:20-alpine AS production

WORKDIR /app

# prod deps: timezone + pg client
RUN apk add --no-cache tzdata postgresql-client curl

# Добавляем sequelize-cli
# (он нужен для миграций, но не обязателен как dev dep)
RUN npm install --no-save sequelize-cli dotenv

# Копируем prod dependencies из builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Копируем файлы, нужные в runtime
COPY .sequelizerc ./
COPY sequelize ./sequelize
COPY swagger.yaml ./
COPY shared/seeds ./shared/locations
COPY shared/i18n/locales ./shared/i18n/locales
COPY fcm.json ./


# Таймзона
#ENV TZ=Asia/Tashkent
#RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# user security (optional but recommended)
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN mkdir -p /app/public/users/avatars \
    && chown -R nodejs:nodejs /app/public

EXPOSE 5000 9100

CMD ["node", "dist/src/main.js"]