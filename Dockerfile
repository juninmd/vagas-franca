FROM oven/bun:1-slim
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src

ENV DB_PATH=/data/store.db
# O banco é o estado do radar (dedupe, "já postei", histórico do raio-X). Sem
# volume, cada deploy reposta tudo do zero no canal.
RUN mkdir -p /data && chown -R bun:bun /data /app
VOLUME ["/data"]
USER bun

# --loop é obrigatório: sem ele o processo roda um ciclo e sai, o orquestrador
# reinicia em laço e o cron do agente nunca chega a disparar.
CMD ["bun", "run", "src/index.ts", "--loop"]
