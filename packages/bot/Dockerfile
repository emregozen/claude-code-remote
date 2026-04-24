FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/bot ./packages/bot
RUN npm ci --workspaces
RUN npm --workspace=packages/bot run build

FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
RUN addgroup -S cr && adduser -S cr -G cr && chown -R cr:cr /app
USER cr
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "packages/bot/dist/index.js"]
