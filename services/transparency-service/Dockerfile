FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY services/transparency-service/package.json ./services/transparency-service/
RUN npm install --include=dev
COPY services/transparency-service ./services/transparency-service
RUN npm run build --workspace=@capmint/transparency-service

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/transparency-service/package.json ./services/transparency-service/
COPY --from=builder /app/services/transparency-service/dist ./services/transparency-service/dist
EXPOSE 8085
CMD ["npm", "start", "--workspace=@capmint/transparency-service"]
