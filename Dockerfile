# Railway Puppeteer 호환 Dockerfile
# Node.js 20 + Chromium 의존성 포함

FROM node:20-slim

# Puppeteer에 필요한 Chromium 의존성 설치
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-khmeros \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer가 번들 Chromium 대신 시스템 Chromium 사용하도록 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 루트 package.json 복사 후 의존성 설치
COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/
COPY shared/ ./shared/

RUN npm install

# 소스 복사
COPY client/ ./client/
COPY server/ ./server/

# 클라이언트 빌드
RUN npm run build --prefix client

# 서버 빌드
RUN npm run build --prefix server

# 포트 설정 (Railway가 PORT 환경변수를 제공)
EXPOSE ${PORT:-5050}

# 서버 시작
CMD ["npm", "run", "start"]
