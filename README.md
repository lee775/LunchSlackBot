# 카카오톡-슬랙 프로필 동기화 봇

매일 지정된 시간에 카카오톡 플러스친구의 프로필 이미지를 자동으로 가져와서 슬랙 채널에 전송하는 자동화 프로그램입니다.

## 주요 기능

- 🔄 **자동 스케줄링**: 매일 지정된 시간에 자동 실행
- 📸 **프로필 이미지 스크래핑**: Puppeteer를 사용한 안정적인 이미지 수집
- 📤 **슬랙 자동 전송**: Slack Web API를 통한 이미지 업로드 및 메시지 전송
- 🎲 **랜덤 메뉴 선택**: 메뉴가 마음에 안 들 때 버튼 클릭으로 대체 메뉴 추천 (하루 1회)
- 🔘 **인터랙티브 버튼**: Slack Block Kit을 사용한 사용자 친화적 인터페이스
- 📝 **상세 로깅**: Winston을 사용한 체계적인 로그 관리
- ⚠️ **에러 알림**: 실패 시 슬랙으로 에러 알림 전송
- 🧪 **테스트 모드**: 즉시 실행 및 상태 확인 기능

## 시스템 요구사항

- Node.js 16.x 이상
- npm 또는 yarn
- Slack Bot Token 및 채널 접근 권한
- 카카오톡 플러스친구 URL

## 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example` 파일을 `.env`로 복사하고 필요한 값들을 설정하세요.

```bash
cp .env.example .env
```

`.env` 파일 예시:
```env
# Slack Bot Token (Slack App에서 발급)
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token

# 시작 알림을 받을 채널 (봇 관리용)
SLACK_STARTUP_CHANNEL_ID=C1234567890

# 점심메뉴를 받을 채널 (메인 점심메뉴 채널)
SLACK_LUNCH_CHANNEL_ID=C0987654321

# 기존 호환성을 위한 기본 채널
SLACK_CHANNEL_ID=C1234567890

# 모니터링할 카카오톡 플러스친구 URL
KAKAO_PLUS_FRIEND_URL=https://pf.kakao.com/_your_friend_id

# 실행 스케줄 (cron 형식, 기본: 매일 오전 9시)
SCHEDULE_CRON=0 9 * * *

# 로그 레벨 (error, warn, info, debug)
LOG_LEVEL=info

# 웹 서버 포트 (Slack Interactive Components 수신용)
SERVER_PORT=3000

# 대체 점심 메뉴 (콤마로 구분, 비워두면 기본 메뉴 사용)
ALTERNATIVE_MENUS=김치찌개,된장찌개,부대찌개,비빔밥,제육볶음,돈까스,불고기,삼겹살,치킨,피자,파스타,햄버거,초밥,라멘,쌀국수
```

### 3. Slack App 설정

1. [Slack API](https://api.slack.com/apps) 에서 새 앱 생성
2. **OAuth & Permissions**에서 다음 권한 추가:
   - `chat:write` - 메시지 전송
   - `files:write` - 파일 업로드
   - `channels:read` - 채널 정보 읽기
3. **Interactive Components** 활성화:
   - **Interactivity & Shortcuts** 메뉴로 이동
   - **Interactivity** 켜기 (Turn On)
   - **Request URL** 설정: 봇 실행 시 콘솔에 표시되는 ngrok URL 사용
   - 예: `https://abc-123.ngrok-free.app/slack/interactions`
   - ⚠️ **중요**: `npm start` 실행 후 콘솔에 나오는 URL을 사용하세요
4. Bot Token을 복사하여 `.env` 파일에 설정
5. 봇을 원하는 채널에 초대

**ngrok 설정 (최초 1회):**
1. https://dashboard.ngrok.com/signup 에서 무료 가입
2. authtoken 복사
3. `.env` 파일에 추가: `NGROK_AUTHTOKEN=your_token`
4. 이후 `npm start`만 하면 자동으로 터널 생성!

### 4. 채널 ID 확인

슬랙 채널에서 우클릭 → "링크 복사" → URL에서 채널 ID 추출
예: `https://workspace.slack.com/archives/C1234567890` → `C1234567890`

## 사용법

### 일반 실행 (스케줄러 모드)

```bash
npm start
```

**자동으로 실행되는 것들:**
- ✅ Express 웹 서버 (포트 3000)
- ✅ ngrok 터널 (공개 URL 자동 생성, 비밀번호 불필요!)
- ✅ 스케줄러 (매일 12시 자동 실행)

**콘솔에 나오는 URL을 사용하여 Slack App을 설정하세요!**

**최초 설정:**
1. https://dashboard.ngrok.com/signup 에서 무료 가입
2. authtoken 복사
3. `.env` 파일에 `NGROK_AUTHTOKEN=your_token` 추가

### 테스트 실행 (즉시 실행)

```bash
npm start -- --test
# 또는
node src/index.js --test
```

스케줄을 기다리지 않고 즉시 프로필 동기화를 실행합니다.

### 상태 확인

```bash
npm start -- --status
# 또는
node src/index.js --status
```

현재 봇의 상태와 설정을 JSON 형식으로 출력합니다.

### 개발 모드 (자동 재시작)

```bash
npm run dev
```

코드 변경 시 자동으로 재시작되는 개발 모드입니다.

## 랜덤 메뉴 선택 기능 사용법

1. 매일 점심 메뉴가 슬랙 채널에 전송되면 이미지 아래에 "🎲 메뉴가 마음에 안 들어요" 버튼이 표시됩니다.
2. **누구든 처음 버튼을 클릭한 사람**이 대체 메뉴를 선택하면, **채널 전체에 공개**됩니다.
3. 이 기능은 **하루에 한 번만** 사용할 수 있습니다 (누가 눌러도 한 번).
4. 두 번째 클릭부터는 개인 메시지로 "이미 오늘 메뉴를 변경하셨습니다" 알림만 표시됩니다.
5. 대체 메뉴는 `.env` 파일의 `ALTERNATIVE_MENUS`에서 설정할 수 있습니다.

**예시:**
- 철수님이 버튼 클릭 → "철수님이 대체 메뉴를 선택했습니다! **김치찌개**" (전체 공개)
- 영희님이 버튼 클릭 → "이미 오늘 메뉴를 변경하셨습니다" (영희님만 보임)

## 프로젝트 구조

```
src/
├── config/
│   └── index.js          # 환경 변수 및 설정 관리
├── services/
│   ├── kakaoScraper.js   # 카카오톡 프로필 이미지 스크래핑
│   ├── slackClient.js    # 슬랙 API 클라이언트
│   ├── usageTracker.js   # 사용 기록 추적 (하루 한 번 제한)
│   └── ocrService.js     # OCR 서비스
├── scheduler/
│   └── index.js          # 작업 스케줄러
├── server/
│   └── index.js          # Express 웹 서버 (Interactive Components)
├── utils/
│   └── logger.js         # 로깅 시스템
└── index.js              # 메인 애플리케이션
```

## 로그 관리

- **콘솔 출력**: 실시간 로그 확인
- **파일 저장**: `logs/app.log` (일반 로그), `logs/error.log` (에러 로그)
- **로그 로테이션**: 파일 크기 5MB 초과 시 자동 로테이션 (최대 5개 파일 보관)

## 트러블슈팅

### 일반적인 문제

1. **Slack Bot Token 오류**
   - 토큰이 `xoxb-`로 시작하는지 확인
   - 봇이 대상 채널에 추가되었는지 확인

2. **카카오톡 페이지 접근 실패**
   - 플러스친구 URL이 정확한지 확인
   - 페이지가 공개되어 있는지 확인

3. **프로필 이미지를 찾을 수 없음**
   - 페이지 구조가 변경되었을 수 있음
   - 로그를 확인하여 어떤 선택자가 실패했는지 확인

### 환경 변수 검증

프로그램 시작 시 필수 환경 변수가 누락된 경우 오류 메시지와 함께 종료됩니다.

### 권한 문제

Docker나 제한된 환경에서 실행 시 Puppeteer 실행에 필요한 권한과 의존성이 있는지 확인하세요.

### 랜덤 메뉴 버튼 동작 안 함

1. **ngrok authtoken 확인**
   - `.env` 파일에 `NGROK_AUTHTOKEN`이 설정되어 있는지 확인
   - https://dashboard.ngrok.com/get-started/your-authtoken 에서 token 확인

2. **Interactive Components URL 설정 확인**
   - `npm start` 실행 시 콘솔에 표시되는 ngrok URL을 Slack App에 설정했는지 확인
   - Request URL이 `/slack/interactions`로 끝나는지 확인

3. **서버 실행 상태 확인**
   - 콘솔 로그에 "ngrok tunnel" 메시지가 보이는지 확인
   - 서버가 정상적으로 시작되었는지 로그 확인

4. **사용 기록 파일 권한 확인**
   - `data/usage.json` 파일에 읽기/쓰기 권한이 있는지 확인

## 개발 정보

- **Language**: Node.js
- **Web Scraping**: Puppeteer
- **Slack API**: @slack/web-api
- **Web Server**: Express
- **Scheduling**: node-cron
- **Logging**: Winston
- **Environment**: dotenv
- **HTTP Client**: Axios

### 주요 의존성

- `express`: Interactive Components 수신을 위한 웹 서버
- `body-parser`: HTTP 요청 파싱
- `puppeteer`: 웹 스크래핑
- `@slack/web-api`: Slack API 클라이언트
- `node-cron`: 작업 스케줄링
- `winston`: 로깅 시스템
- `axios`: HTTP 요청
- `dotenv`: 환경 변수 관리

## 라이센스

MIT License

## 기여

이슈 리포트나 개선 제안은 언제든 환영합니다!