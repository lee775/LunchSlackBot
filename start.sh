#!/bin/bash

# KakaoTalk-Slack Bot Normal Mode
# Runs on schedule in background

set -e

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}KakaoTalk-Slack Bot - 일반 실행${NC}"
echo -e "${CYAN}Scheduled Background Mode${NC}"
echo -e "${CYAN}========================================${NC}"
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
export NODE_ENV=production
export LOG_LEVEL=info

echo -e "${YELLOW}[INFO]${NC} Environment: production"
echo -e "${YELLOW}[INFO]${NC} Log Level: info"
echo -e "${YELLOW}[INFO]${NC} Mode: Scheduled (using .env configuration)"
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

# .env 파일에서 설정 정보 읽기
if grep -q "SCHEDULE_CRON" .env; then
    SCHEDULE=$(grep "SCHEDULE_CRON" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    echo -e "${YELLOW}[INFO]${NC} Schedule: $SCHEDULE"
fi

if grep -q "SLACK_LUNCH_CHANNEL_ID" .env; then
    LUNCH_CHANNEL=$(grep "SLACK_LUNCH_CHANNEL_ID" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    echo -e "${YELLOW}[INFO]${NC} Lunch Channel: $LUNCH_CHANNEL"
fi

if grep -q "SLACK_STARTUP_CHANNEL_ID" .env; then
    STARTUP_CHANNEL=$(grep "SLACK_STARTUP_CHANNEL_ID" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    echo -e "${YELLOW}[INFO]${NC} Startup Channel: $STARTUP_CHANNEL"
fi

# 이미 실행 중인 프로세스 확인
RUNNING_PID=$(pgrep -f "node src/index.js" | head -1)
if [ ! -z "$RUNNING_PID" ]; then
    echo ""
    echo -e "${YELLOW}[WARN]${NC} Bot이 이미 실행 중입니다 (PID: $RUNNING_PID)"
    echo ""
    read -p "기존 프로세스를 종료하고 다시 시작하시겠습니까? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}[INFO]${NC} 기존 프로세스 종료 중..."
        kill $RUNNING_PID
        sleep 2
    else
        echo -e "${RED}[CANCEL]${NC} 실행이 취소되었습니다."
        exit 0
    fi
fi

# logs 디렉토리 확인
mkdir -p logs

echo ""
echo -e "${CYAN}[START]${NC} Bot starting in scheduled mode..."
echo -e "${YELLOW}[TIP]${NC} Bot will run in background according to schedule"
echo -e "${YELLOW}[TIP]${NC} Logs: $APP_DIR/logs/combined.log"
echo -e "${YELLOW}[TIP]${NC} Stop: pkill -f 'node src/index.js'"
echo ""

# 백그라운드에서 Bot 실행
nohup node src/index.js > logs/output.log 2>&1 &
BOT_PID=$!

sleep 2

# 프로세스 실행 확인
if ps -p $BOT_PID > /dev/null; then
    echo -e "${GREEN}[SUCCESS]${NC} Bot started successfully!"
    echo -e "${GREEN}[INFO]${NC} Process ID: $BOT_PID"
    echo ""
    echo "실행 중인 Bot 상태 확인:"
    echo "  ps aux | grep 'node src/index.js'"
    echo ""
    echo "로그 실시간 확인:"
    echo "  tail -f logs/combined.log"
    echo "  tail -f logs/output.log"
    echo ""
    echo "Bot 중지:"
    echo "  pkill -f 'node src/index.js'"
    echo "  # 또는"
    echo "  kill $BOT_PID"
    echo ""
else
    echo -e "${RED}[ERROR]${NC} Bot 시작 실패"
    echo "로그를 확인하세요:"
    echo "  cat logs/output.log"
    exit 1
fi
