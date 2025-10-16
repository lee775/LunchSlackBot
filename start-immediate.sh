#!/bin/bash

# KakaoTalk-Slack Bot Test Mode
# Runs immediately without waiting for schedule

set -e

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}KakaoTalk-Slack Bot - Test Mode${NC}"
echo -e "${BLUE}Immediate Execution (No Schedule)${NC}"
echo -e "${BLUE}========================================${NC}"
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
export NODE_ENV=test
export LOG_LEVEL=debug

echo -e "${YELLOW}[INFO]${NC} Environment: test"
echo -e "${YELLOW}[INFO]${NC} Log Level: debug"
echo -e "${YELLOW}[INFO]${NC} Mode: Immediate execution"
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

# .env 파일에서 채널 정보 읽기
if grep -q "SLACK_LUNCH_CHANNEL_ID" .env; then
    LUNCH_CHANNEL=$(grep "SLACK_LUNCH_CHANNEL_ID" .env | cut -d '=' -f2)
    echo -e "${YELLOW}[INFO]${NC} Lunch Channel: $LUNCH_CHANNEL"
fi

if grep -q "SLACK_STARTUP_CHANNEL_ID" .env; then
    STARTUP_CHANNEL=$(grep "SLACK_STARTUP_CHANNEL_ID" .env | cut -d '=' -f2)
    echo -e "${YELLOW}[INFO]${NC} Startup Channel: $STARTUP_CHANNEL"
fi

echo ""
echo -e "${BLUE}[TEST]${NC} Bot starting in test mode..."
echo -e "${YELLOW}[TIP]${NC} This will run immediately without waiting for schedule"
echo -e "${YELLOW}[TIP]${NC} Press Ctrl+C to stop"
echo ""

# Test 모드로 Bot 실행
node src/index.js --test
