FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS builder
WORKDIR /app
ARG DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
# Use dummy URL for prisma generate (only needs schema, not real DB)
ENV DATABASE_URL=${DATABASE_URL}
# Copy local packages first (tailwind-preset is file: dependency)
COPY packages/ /packages/
COPY app/package*.json ./
RUN npm install
COPY app/ .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    apk add --no-cache openssh-client && \
    mkdir -p /home/nextjs/.ssh && \
    chmod 700 /home/nextjs/.ssh && \
    chown nextjs:nodejs /home/nextjs/.ssh

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

EXPOSE 3000
COPY <<'EOF' /entrypoint.sh
#!/bin/sh
# Copy SSH keys from mounted volume to user's ~/.ssh with correct permissions
SSH_DIR=/home/nextjs/.ssh
if [ -f /ssh-keys/id_ed25519 ]; then
  cp /ssh-keys/id_ed25519 "$SSH_DIR/id_ed25519"
  chmod 600 "$SSH_DIR/id_ed25519"
fi
if [ -f /ssh-keys/known_hosts ]; then
  cp /ssh-keys/known_hosts "$SSH_DIR/known_hosts"
  chmod 644 "$SSH_DIR/known_hosts"
fi
if [ -f /ssh-keys/config ]; then
  cp /ssh-keys/config "$SSH_DIR/config"
  chmod 600 "$SSH_DIR/config"
fi
exec node server.js
EOF
RUN chmod +x /entrypoint.sh && chown nextjs:nodejs /entrypoint.sh

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:3000 || exit 1

# Ensure .next/cache is writable for image optimization + ISR
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next/cache

USER nextjs
CMD ["/entrypoint.sh"]
