FROM oven/bun:1.0

COPY package.json bun.lockb .
RUN bun install

COPY . .

CMD ["bun", "dev"]