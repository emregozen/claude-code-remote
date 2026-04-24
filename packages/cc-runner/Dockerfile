FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/cc-runner ./packages/cc-runner
RUN npm ci --workspaces
RUN npm --workspace=packages/cc-runner run build

FROM node:20-alpine
RUN apk add --no-cache tini git bash curl
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY packages/cc-runner/src/hooks /app/hooks
RUN find /app/hooks -name "*.sh" -exec chmod +x {} \;
RUN npm install -g @anthropic-ai/claude-code
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "packages/cc-runner/dist/index.js"]
