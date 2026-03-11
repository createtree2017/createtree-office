# Playwright + Chromium이 포함된 Node.js 이미지
# Railway가 이 Dockerfile을 자동 감지하여 빌드합니다
FROM node:20-slim

# Playwright/Chromium에 필요한 시스템 라이브러리 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 루트 package.json 복사 및 설치
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/ shared/

RUN npm install

# Playwright Chromium 브라우저 설치
RUN npx playwright install chromium

# 소스 코드 복사
COPY client/ client/
COPY server/ server/

# 빌드 (client + server)
RUN npm run build

# 포트 노출
EXPOSE 5050

# 서버 시작
CMD ["npm", "run", "start"]
