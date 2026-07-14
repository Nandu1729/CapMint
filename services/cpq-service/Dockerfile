FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY services/cpq-service/package.json ./services/cpq-service/
RUN npm install --include=dev
COPY services/cpq-service ./services/cpq-service
RUN npm run build --workspace=@capmint/cpq-service

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/cpq-service/package.json ./services/cpq-service/
COPY --from=builder /app/services/cpq-service/dist ./services/cpq-service/dist
EXPOSE 8082
CMD ["npm", "start", "--workspace=@capmint/cpq-service"]
