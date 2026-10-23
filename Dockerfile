FROM node:22-alpine

WORKDIR /app

# Copy dependency files first to maximize Docker layer cache hits
COPY package*.json ./

# Install dependencies and clean npm cache to keep image size small
RUN npm install && npm cache clean --force

# Copy application source code (node_modules and .next are excluded by .dockerignore)
COPY . .

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["npm", "run", "dev"]