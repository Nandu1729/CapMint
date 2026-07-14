FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY services/mint-service/package.json ./services/mint-service/
RUN npm install --include=dev
COPY services/mint-service ./services/mint-service
RUN npm run build --workspace=@capmint/mint-service

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/mint-service/package.json ./services/mint-service/
COPY --from=builder /app/services/mint-service/dist ./services/mint-service/dist
EXPOSE 8083
CMD ["npm", "start", "--workspace=@capmint/mint-service"]
