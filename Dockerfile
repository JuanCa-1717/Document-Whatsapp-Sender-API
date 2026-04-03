FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --prefer-offline --no-audit

# Copy app code
COPY . .

# Expose port (Render usa 10000, pero se configura con ENV)
EXPOSE ${PORT:-3000}

# Set environment variables
ENV NODE_ENV=production

# Start API
CMD ["node", "app.js"]
