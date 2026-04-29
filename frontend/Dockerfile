# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

# Accept the API Gateway URL as a build argument
ARG VITE_GATEWAY_URL
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ─── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginx:alpine

# Copy the build output to Nginx's html directory
COPY --from=build /app/dist /usr/share/nginx/html

# Add a basic Nginx config to handle React Router (SPA) routing
# This ensures that refreshing on /dashboard or other routes doesn't 404
RUN echo 'server { \
    listen 80; \
    location / { \
    root /usr/share/nginx/html; \
    index index.html index.htm; \
    try_files $uri $uri/ /index.html; \
    } \
    }' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
