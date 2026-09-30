FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/

# Run as non-root user
USER node

EXPOSE 10000

CMD ["node", "src/server.js"]
