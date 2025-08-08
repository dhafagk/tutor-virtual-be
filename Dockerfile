FROM node:18-alpine

WORKDIR /app

# Install dependencies for Prisma
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy application files
COPY . .

# Expose port (render.com uses PORT env var)
EXPOSE $PORT

# Start the application
CMD ["npm", "start"]