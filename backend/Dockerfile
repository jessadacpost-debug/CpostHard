FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose port
EXPOSE 5000

# Environment variables
ENV PORT=5000 \
    NODE_ENV=production

# Run the server
CMD ["node", "server.js"]
