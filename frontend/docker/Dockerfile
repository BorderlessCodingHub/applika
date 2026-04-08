# Stage 1: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

ARG API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${API_BASE_URL}

WORKDIR /app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Serve
FROM nginx:1.27-alpine

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /usr/share/nginx/html && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown appuser:appgroup /var/run/nginx.pid

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=appuser:appgroup /app/out /usr/share/nginx/html

USER appuser

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
