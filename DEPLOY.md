# Ubuntu Linux 배포 가이드

KakaoTalk-Slack Profile Sync Bot을 Ubuntu Linux 서버에 배포하는 방법입니다.

## 📋 사전 요구사항

### Windows (배포하는 쪽)
- Git for Windows 설치 (Git Bash 포함)
- PEM 키 파일: `C:\WOOK\lightsail\LightsailDefaultKey-ap-northeast-2.pem`
- SSH 접근 가능한 Linux 서버

### Linux 서버 (배포 대상)
- Ubuntu 18.04 이상 (또는 Debian 기반 배포판)
- SSH 접근 권한
- sudo 권한

## 🚀 자동 배포 (권장)

### 1단계: 배포 스크립트 실행

Windows에서 `deploy-to-linux.bat`을 더블클릭하거나 명령 프롬프트에서 실행:

```cmd
deploy-to-linux.bat
```

### 2단계: 배포 정보 입력

스크립트 실행 시 다음 정보를 입력:

- **서버 IP 주소**: AWS Lightsail 또는 EC2 인스턴스의 공인 IP
- **사용자명**: 기본값 `ubuntu` (Enter로 넘어가기)
- **배포 경로**: 기본값 `/home/ubuntu/kakao-slack-bot` (Enter로 넘어가기)

### 3단계: 환경 변수 설정

배포가 완료되면 서버에 SSH로 접속:

```bash
ssh -i "C:\WOOK\lightsail\LightsailDefaultKey-ap-northeast-2.pem" ubuntu@YOUR_SERVER_IP
```

`.env` 파일 편집:

```bash
cd /home/ubuntu/kakao-slack-bot
nano .env
```

필수 환경 변수 입력:

```bash
SLACK_BOT_TOKEN=xoxb-your-actual-token
SLACK_STARTUP_CHANNEL_ID=C1234567890
SLACK_LUNCH_CHANNEL_ID=C0987654321
KAKAO_PLUS_FRIEND_URL=https://pf.kakao.com/_your_friend_id
SCHEDULE_CRON=0 9 * * *
LOG_LEVEL=info
```

저장: `Ctrl+X` → `Y` → `Enter`

### 4단계: 서비스 시작

```bash
sudo systemctl start kakao-slack-bot
sudo systemctl status kakao-slack-bot
```

서비스가 정상 작동하면 자동 시작 활성화:

```bash
sudo systemctl enable kakao-slack-bot
```

## 🔧 수동 배포

자동 배포 스크립트를 사용하지 않는 경우:

### 1. 서버에 파일 전송

```bash
# 프로젝트 압축
tar --exclude='node_modules' --exclude='logs' --exclude='.git' --exclude='.env' -czf kakao-slack-bot.tar.gz .

# 서버로 전송
scp -i "C:\WOOK\lightsail\LightsailDefaultKey-ap-northeast-2.pem" kakao-slack-bot.tar.gz ubuntu@YOUR_SERVER_IP:/home/ubuntu/

# SSH 접속
ssh -i "C:\WOOK\lightsail\LightsailDefaultKey-ap-northeast-2.pem" ubuntu@YOUR_SERVER_IP

# 압축 해제
mkdir -p kakao-slack-bot
cd kakao-slack-bot
tar -xzf ../kakao-slack-bot.tar.gz
```

### 2. 설정 스크립트 실행

```bash
chmod +x setup-linux.sh
bash setup-linux.sh
```

스크립트가 자동으로 다음 작업을 수행합니다:
- Node.js 설치 (없는 경우)
- Chromium 및 의존성 패키지 설치
- npm 패키지 설치
- systemd 서비스 등록

### 3. 환경 변수 설정

위의 "자동 배포 - 3단계" 참고

## 📊 서비스 관리

### 서비스 명령어

```bash
# 서비스 시작
sudo systemctl start kakao-slack-bot

# 서비스 중지
sudo systemctl stop kakao-slack-bot

# 서비스 재시작
sudo systemctl restart kakao-slack-bot

# 서비스 상태 확인
sudo systemctl status kakao-slack-bot

# 자동 시작 활성화
sudo systemctl enable kakao-slack-bot

# 자동 시작 비활성화
sudo systemctl disable kakao-slack-bot
```

### 로그 확인

```bash
# 실시간 로그 확인
sudo journalctl -u kakao-slack-bot -f

# 최근 100줄 로그
sudo journalctl -u kakao-slack-bot -n 100

# 오늘 날짜 로그
sudo journalctl -u kakao-slack-bot --since today

# 특정 시간 이후 로그
sudo journalctl -u kakao-slack-bot --since "2025-01-01 09:00:00"
```

### 애플리케이션 로그

```bash
# logs 디렉토리 확인
cd /home/ubuntu/kakao-slack-bot/logs
ls -lh

# 로그 파일 보기
tail -f combined.log
tail -f error.log
```

## 🔄 업데이트 배포

코드 수정 후 재배포:

1. Windows에서 `deploy-to-linux.bat` 재실행
2. 서버에서 서비스 재시작:
   ```bash
   sudo systemctl restart kakao-slack-bot
   ```

## 🐛 문제 해결

### SSH 연결 실패

```bash
# PEM 키 권한 확인 (Linux/Git Bash)
chmod 400 /c/WOOK/lightsail/LightsailDefaultKey-ap-northeast-2.pem

# 연결 테스트
ssh -i "C:\WOOK\lightsail\LightsailDefaultKey-ap-northeast-2.pem" ubuntu@YOUR_SERVER_IP -v
```

### 서비스 시작 실패

```bash
# 상세 에러 로그 확인
sudo journalctl -u kakao-slack-bot -n 50 --no-pager

# 수동 실행으로 에러 확인
cd /home/ubuntu/kakao-slack-bot
node src/index.js
```

### Puppeteer 에러

Chromium 의존성 재설치:

```bash
sudo apt-get update
sudo apt-get install -y chromium-browser libgbm1
```

### 권한 문제

```bash
# 파일 소유권 확인
ls -la /home/ubuntu/kakao-slack-bot

# 소유권 변경 (필요시)
sudo chown -R ubuntu:ubuntu /home/ubuntu/kakao-slack-bot
```

## 🔒 보안 권장사항

1. **방화벽 설정**: SSH 포트(22)만 필요한 IP에서 접근 가능하도록 설정
2. **PEM 키 보안**: PEM 키 파일 권한을 400으로 설정
3. **.env 파일 보안**: .env 파일에 중요 정보 포함, Git에 커밋하지 않기
4. **정기 업데이트**: OS 및 패키지 정기적으로 업데이트

```bash
# 시스템 업데이트
sudo apt-get update && sudo apt-get upgrade -y
```

## 📞 지원

문제 발생 시:
1. 로그 확인: `sudo journalctl -u kakao-slack-bot -n 100`
2. 서비스 상태: `sudo systemctl status kakao-slack-bot`
3. 수동 실행: `node src/index.js`

---

**다음 단계**: [README.md](README.md)에서 봇 사용법 확인
