# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (for caching dependencies)
COPY package*.json tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript -> JavaScript
RUN npm run build

# Stage 2: Run
FROM node:20-alpine

WORKDIR /app

# Copy only built files and node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Expose the app port
EXPOSE 3000

# Start the app
CMD ["node", "dist/index.js"]
