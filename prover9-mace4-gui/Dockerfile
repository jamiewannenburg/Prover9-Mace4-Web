FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=${REACT_APP_API_URL:-/api}

# Install dependencies
RUN npm ci

# Copy all files
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM nginx:stable-alpine

# Set API URL to the port forwarded from the API container
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=${REACT_APP_API_URL:-/api}

# Copy built assets from the builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"] 