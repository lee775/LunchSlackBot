#!/bin/bash

# KakaoTalk-Slack Bot Resend Mode
# Resend Channel: C090MMGGS5V

set -e

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${MAGENTA}========================================${NC}"
echo -e "${MAGENTA}KakaoTalk-Slack Bot - 재발송${NC}"
echo -e "${MAGENTA}Resend Channel: C090MMGGS5V${NC}"
echo -e "${MAGENTA}========================================${NC}"
echo ""

# 현재 디렉토리 확인
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo -e "${YELLOW}[INFO]${NC} Working directory: $APP_DIR"

# .env 파일 확인
if [ ! -f ".env" ]; then
    echo -e "${RED}[ERROR]${NC} .env 파일을 찾을 수 없습니다."
    echo "먼저 .env 파일을 생성하세요:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    exit 1
fi

# node_modules 확인
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[WARN]${NC} node_modules가 없습니다. npm install을 실행합니다..."
    npm install
fi

# 환경 변수 설정
export NODE_ENV=development
export LOG_LEVEL=debug
export SLACK_CHANNEL_ID=C090MMGGS5V
export SLACK_STARTUP_CHANNEL_ID=C090MMGGS5V
export SLACK_LUNCH_CHANNEL_ID=C090MMGGS5V

echo -e "${YELLOW}[INFO]${NC} Environment: development"
echo -e "${YELLOW}[INFO]${NC} Log Level: debug"
echo -e "${YELLOW}[INFO]${NC} Resend Channel: C090MMGGS5V"
echo ""

# Chromium 경로 설정 (Ubuntu/Debian)
if command -v chromium-browser &> /dev/null; then
    export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
    echo -e "${GREEN}[OK]${NC} Chromium found: /usr/bin/chromium-browser"
elif command -v chromium &> /dev/null; then
    export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
    echo -e "${GREEN}[OK]${NC} Chromium found: /usr/bin/chromium"
else
    echo -e "${RED}[ERROR]${NC} Chromium을 찾을 수 없습니다."
    echo "다음 명령으로 설치하세요:"
    echo "  sudo apt-get install chromium-browser"
    exit 1
fi

echo ""
echo -e "${MAGENTA}[RESEND]${NC} Bot starting in resend mode..."
echo -e "${YELLOW}[TIP]${NC} Press Ctrl+C to stop"
echo ""

# Bot 실행
node src/index.js
