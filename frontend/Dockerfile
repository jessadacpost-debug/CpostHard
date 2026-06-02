# Stage 1: Build Vite React bundle
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve compiled assets on lightweight production server
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist

# Expose production port
EXPOSE 80

# Serve static directory with SPA routing enabled (-s)
CMD ["serve", "-s", "dist", "-l", "80"]
