FROM node:20-alpine

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

RUN npm install -g tsx

WORKDIR /workspace

ENV NODE_ENV=production
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/lib/chromium/

USER node

CMD ["tsx", "index.ts"]