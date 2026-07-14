FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY services/resolver-service/package.json ./services/resolver-service/
RUN npm install --include=dev
COPY services/resolver-service ./services/resolver-service
RUN npm run build --workspace=@capmint/resolver-service

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/resolver-service/package.json ./services/resolver-service/
COPY --from=builder /app/services/resolver-service/dist ./services/resolver-service/dist
EXPOSE 8084
CMD ["npm", "start", "--workspace=@capmint/resolver-service"]
