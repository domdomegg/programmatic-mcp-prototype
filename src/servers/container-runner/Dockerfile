FROM node:20-alpine

# Install Python, uv, and system dependencies including build tools
RUN apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    gcc \
    musl-dev \
    libffi-dev \
    make \
    git \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl \
    bash

# Install tsx globally (npm/npx are already included with node image)
RUN npm install -g tsx

# Switch to node user before installing uv
USER node

# Install uv (Python package manager with uvx) for the node user
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Add uv to PATH
ENV PATH="/home/node/.local/bin:${PATH}"

WORKDIR /model_accessible_files/workspace

ENV NODE_ENV=production
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/lib/chromium/

CMD ["tsx", "index.ts"]