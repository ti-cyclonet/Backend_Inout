# Etapa 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY nest-cli.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN ./node_modules/.bin/nest build

# Etapa 2: Imagen final
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

ENV NODE_ENV=production
ENV APP_PORT=3001
EXPOSE 3001

CMD ["node", "dist/src/main"]
