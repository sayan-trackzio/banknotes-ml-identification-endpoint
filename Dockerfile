# Simple Dockerfile for the Query API (production)
FROM node:22-slim

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN set -ex \
  && if [ -f package-lock.json ]; then npm ci --only=production; else npm install --production; fi

# Copy app sources
COPY . .

# Create non-root user before chown
RUN addgroup --system app && adduser --system --ingroup app app || true

# Create the actual cache directory transformers-js uses
RUN mkdir -p /usr/src/app/node_modules/@huggingface/transformers/.cache \
  && chown -R app:app /usr/src/app/node_modules/@huggingface/transformers/.cache

# Pre-download the model as root (into .cache)
RUN node bootstrap.js

# Drop privileges
USER app

# Expose port
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/app.js"]
