# Simple Dockerfile for the Query API (production)
FROM node:22-slim

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
# Prefer package-lock if present, otherwise fall back to npm install
RUN set -ex \
  && if [ -f package-lock.json ]; then npm ci --only=production; else npm install --production; fi

# Copy app sources
COPY . .

# Use non-root user
RUN addgroup --system app && adduser --system --ingroup app app || true
USER app

# Expose port
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/app.js"]
