# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.19.0

FROM node:${NODE_VERSION}-bookworm-slim AS plugin-builder

ARG PNPM_VERSION=11.19.0
RUN --mount=type=cache,target=/root/.npm \
    npm install --global "pnpm@${PNPM_VERSION}"

WORKDIR /build/topic-desk
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/_build/typert-protocol/package.json packages/_build/typert-protocol/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
    && pnpm pack --pack-destination /build/artifacts

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ARG DSH_VERSION=0.1.5-rc.2
ARG PNPM_VERSION=11.19.0

RUN --mount=type=cache,target=/root/.npm \
    npm install --global \
      --allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs \
      "pnpm@${PNPM_VERSION}" \
      "@deepseek-ai/dsh@${DSH_VERSION}"

ENV DSH_HOME=/opt/dsh-home \
    NODE_ENV=production

COPY --from=plugin-builder /build/artifacts/dsh-topic-desk-plugin-0.1.0.tgz /opt/packages/topic-desk.tgz

RUN dsh --profile web --dump-default-config >/dev/null \
    && dsh plugin --profile web add file:/opt/packages/topic-desk.tgz

COPY docker/cordis.patch.yml /opt/dsh-home/profiles/web/cordis.patch.yml

RUN mkdir -p /var/lib/topic-desk /workspace \
    && chown -R node:node /opt/dsh-home /var/lib/topic-desk /workspace

USER node
WORKDIR /workspace

EXPOSE 3080

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3080/').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"

CMD ["dsh", "web", "--no-open"]
