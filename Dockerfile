FROM node:18-alpine

# Install Python and build tools for native dependencies
RUN apk add --no-cache python3 make g++ 

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S discord -u 1001

# Change ownership
RUN chown -R discord:nodejs /app
USER discord

# Expose port (if needed for health checks)
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]
