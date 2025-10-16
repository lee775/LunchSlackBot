#!/bin/bash

# KakaoTalk-Slack Bot Linux Setup Script
# Ubuntu/Debian용 자동 설정 스크립트

set -e  # 에러 발생 시 스크립트 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로깅 함수
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 루트 권한 확인
if [ "$EUID" -eq 0 ]; then
    log_error "이 스크립트를 root로 실행하지 마세요. sudo 권한이 필요한 경우 자동으로 요청합니다."
    exit 1
fi

# 현재 디렉토리 저장
APP_DIR=$(pwd)
APP_NAME="kakao-slack-bot"

log_info "=== KakaoTalk-Slack Bot Linux 설정 시작 ==="
log_info "설치 경로: $APP_DIR"

# 1. 시스템 업데이트
log_info "시스템 패키지 업데이트..."
sudo apt-get update -qq

# 2. Node.js 설치 확인
log_info "Node.js 설치 확인..."
if ! command -v node &> /dev/null; then
    log_warn "Node.js가 설치되어 있지 않습니다. 설치를 시작합니다..."

    # NodeSource repository 추가 (Node.js 18.x LTS)
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs

    log_info "Node.js $(node -v) 설치 완료"
else
    log_info "Node.js $(node -v) 이미 설치됨"
fi

# 3. Chromium 및 의존성 패키지 설치
log_info "Chromium 및 의존성 패키지 설치..."
sudo apt-get install -y \
    chromium-browser \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libcups2 \
    libxss1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    ca-certificates \
    fonts-liberation \
    xdg-utils

log_info "Chromium 설치 완료"

# 4. npm 의존성 설치
log_info "npm 패키지 설치 중..."
npm install --production

# 5. .env 파일 생성 가이드
if [ ! -f "$APP_DIR/.env" ]; then
    log_warn ".env 파일이 없습니다."
    log_info ".env.example을 복사하여 .env 파일을 생성합니다..."

    if [ -f "$APP_DIR/.env.example" ]; then
        cp "$APP_DIR/.env.example" "$APP_DIR/.env"
        log_warn "⚠️  중요: $APP_DIR/.env 파일을 편집하여 실제 값을 입력하세요!"
        log_warn "   - SLACK_BOT_TOKEN"
        log_warn "   - SLACK_STARTUP_CHANNEL_ID"
        log_warn "   - SLACK_LUNCH_CHANNEL_ID"
        log_warn "   - KAKAO_PLUS_FRIEND_URL"
    else
        log_error ".env.example 파일을 찾을 수 없습니다."
        log_info "수동으로 .env 파일을 생성하세요."
    fi
else
    log_info ".env 파일이 이미 존재합니다."
fi

# 6. logs 디렉토리 생성
log_info "logs 디렉토리 생성..."
mkdir -p "$APP_DIR/logs"

# 7. Puppeteer 환경변수 설정
log_info "Puppeteer 설정..."
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# 8. systemd 서비스 설치
log_info "systemd 서비스 설정..."

if [ -f "$APP_DIR/kakao-slack-bot.service" ]; then
    # 서비스 파일의 경로를 현재 디렉토리로 업데이트
    sed "s|WorkingDirectory=.*|WorkingDirectory=$APP_DIR|g" "$APP_DIR/kakao-slack-bot.service" > /tmp/kakao-slack-bot.service
    sed -i "s|User=.*|User=$USER|g" /tmp/kakao-slack-bot.service

    # systemd 디렉토리에 복사
    sudo cp /tmp/kakao-slack-bot.service /etc/systemd/system/
    sudo chmod 644 /etc/systemd/system/kakao-slack-bot.service

    # systemd 리로드
    sudo systemctl daemon-reload

    log_info "systemd 서비스 설치 완료"

    # 서비스 활성화 여부 확인
    read -p "서비스를 자동 시작하도록 설정하시겠습니까? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo systemctl enable kakao-slack-bot.service
        log_info "서비스 자동 시작 활성화됨"

        read -p "지금 서비스를 시작하시겠습니까? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo systemctl start kakao-slack-bot.service
            log_info "서비스 시작됨"

            # 서비스 상태 확인
            sleep 2
            sudo systemctl status kakao-slack-bot.service --no-pager
        fi
    fi
else
    log_warn "kakao-slack-bot.service 파일을 찾을 수 없습니다."
    log_info "수동으로 systemd 서비스를 설정하세요."
fi

# 9. 설치 완료 메시지
log_info "=== 설치 완료 ==="
echo ""
log_info "다음 명령어로 서비스를 관리할 수 있습니다:"
echo "  서비스 시작:   sudo systemctl start kakao-slack-bot"
echo "  서비스 중지:   sudo systemctl stop kakao-slack-bot"
echo "  서비스 재시작: sudo systemctl restart kakao-slack-bot"
echo "  서비스 상태:   sudo systemctl status kakao-slack-bot"
echo "  로그 확인:     sudo journalctl -u kakao-slack-bot -f"
echo ""
log_warn "⚠️  .env 파일을 반드시 확인하고 실제 값으로 수정하세요!"
echo "  편집: nano $APP_DIR/.env"
echo ""
