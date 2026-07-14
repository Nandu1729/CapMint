FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY services/verification-service/package.json ./services/verification-service/
RUN npm install --include=dev
COPY services/verification-service ./services/verification-service
RUN npm run build --workspace=@capmint/verification-service

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/verification-service/package.json ./services/verification-service/
COPY --from=builder /app/services/verification-service/dist ./services/verification-service/dist
EXPOSE 8086
CMD ["npm", "start", "--workspace=@capmint/verification-service"]
