FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY services/auth-service/package.json ./services/auth-service/
RUN npm install --include=dev
COPY services/auth-service ./services/auth-service
RUN npm run build --workspace=@capmint/auth-service

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/auth-service/package.json ./services/auth-service/
COPY --from=builder /app/services/auth-service/dist ./services/auth-service/dist
EXPOSE 8081
CMD ["npm", "start", "--workspace=@capmint/auth-service"]
