FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY services/integration-service/package.json ./services/integration-service/
RUN npm install --include=dev
COPY services/integration-service ./services/integration-service
RUN npm run build --workspace=@capmint/integration-service

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/integration-service/package.json ./services/integration-service/
COPY --from=builder /app/services/integration-service/dist ./services/integration-service/dist
EXPOSE 8087
CMD ["npm", "start", "--workspace=@capmint/integration-service"]
