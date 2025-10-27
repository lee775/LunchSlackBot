# 🏗️ KakaoTalk-Slack 점심메뉴 봇 - 심층 분석

## 📋 시스템 아키텍처 개요

이 프로젝트는 **5계층 아키텍처**로 구성된 Node.js 기반 자동화 봇입니다:

```
┌─────────────────────────────────────────────────────────┐
│  1. 데이터 수집 계층 (KakaoScraper)                      │
│     Puppeteer → 카카오톡 플러스친구 페이지 스크래핑       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  2. 메시징 계층 (SlackClient)                            │
│     Slack Web API → 파일 업로드 + 인터랙티브 버튼        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  3. 인터랙션 처리 계층 (SlackInteractionServer)          │
│     Express + ngrok → 버튼 클릭 이벤트 수신 및 처리      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  4. 스케줄링 계층 (TaskScheduler)                        │
│     node-cron → 매일 정해진 시간 자동 실행               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  5. 데이터 영속성 계층 (UsageTracker)                    │
│     JSON 파일 → 일일 사용 제한 추적                      │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 데이터 흐름 시나리오

### 시나리오 1️⃣: 정기 실행 (매일 12시)

```javascript
TaskScheduler (cron: "0 12 * * *")
  ↓
KakaoSlackBot.executeTask()
  ↓
KakaoScraper.scrapeProfileImage()
  ├─ Puppeteer 브라우저 실행 (headless: true)
  ├─ 카카오톡 페이지 로드 (waitUntil: 'networkidle2')
  ├─ 프로필 이미지 요소 스크린샷
  └─ 브라우저 종료 후 Buffer 반환
  ↓
SlackClient.uploadAndPostImageWithButton()
  ├─ files.uploadV2() → 이미지 + initial_comment 업로드
  ├─ 3초 대기 (이미지 렌더링 보장)
  └─ chat.postMessage() → 버튼 메시지 별도 전송
  ↓
결과: 채널에 이미지 + "메뉴가 마음에 안 들어요" 버튼 표시
```

**핵심 기술적 결정:**
- **3초 딜레이**: Slack API 내부 처리 순서 때문에 버튼이 이미지보다 먼저 렌더링되는 문제 해결
- **networkidle2**: 동적 로딩되는 프로필 이미지를 완전히 기다림

### 시나리오 2️⃣: 버튼 클릭 (첫 번째)

```javascript
사용자 버튼 클릭
  ↓
Slack → POST https://deirdre-nonsatirizing-nonsuppositionally.ngrok-free.dev/slack/interactions
  ↓
Express 서버 수신
  ├─ res.status(200).send() (즉시 응답, Slack 3초 타임아웃 방지)
  └─ handleChangeMenuAction() (비동기 처리)
      ├─ UsageTracker.canUseToday(today) → true (아직 미사용)
      ├─ Math.random()으로 ALTERNATIVE_MENUS에서 선택
      ├─ UsageTracker.recordUsage() → data/usage.json 저장
      └─ axios.post(response_url, { response_type: 'in_channel' })
  ↓
결과: 채널 전체에 "🎲 오늘의 대체 메뉴: [메뉴명]" 공개 표시
```

### 시나리오 3️⃣: 버튼 클릭 (두 번째 이후)

```javascript
다른 사용자 버튼 클릭
  ↓
handleChangeMenuAction()
  ├─ UsageTracker.canUseToday(today) → false (이미 사용됨)
  └─ axios.post(response_url, { response_type: 'ephemeral' })
  ↓
결과: 클릭한 사용자에게만 "⏰ 오늘은 이미 메뉴가 변경되었습니다!" 표시
```

---

## 🎯 핵심 컴포넌트 상세 분석

### 1. KakaoScraper (Puppeteer 웹 스크래핑)

**파일 위치:** `src/services/kakaoScraper.js`

```javascript
async scrapeProfileImage() {
  const browser = await puppeteer.launch({
    headless: true,              // GUI 없이 백그라운드 실행
    args: ['--no-sandbox']       // 리눅스 환경 호환성
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  const element = await page.$(selector);
  const imageBuffer = await element.screenshot();  // 요소만 캡처

  await browser.close();  // 메모리 누수 방지
  return imageBuffer;
}
```

**기술적 선택 이유:**
- ✅ **headless: true**: 서버 환경(GUI 없음)에서 실행 가능
- ✅ **element.screenshot()**: 전체 페이지가 아닌 프로필 이미지만 캡처 → 용량 절약
- ✅ **Buffer 반환**: 파일 저장 없이 메모리에서 직접 Slack API로 전달

**잠재적 문제와 해결:**
- ⚠️ 카카오톡 선택자 변경 시 실패 → try-catch로 Slack 에러 알림 전송
- ⚠️ 네트워크 타임아웃 → page.goto() 기본 30초 타임아웃 사용

---

### 2. SlackClient (Slack 통합)

**파일 위치:** `src/services/slackClient.js`

**3가지 통신 방식:**

| 방식 | 용도 | 메서드 |
|------|------|--------|
| REST API | 능동적 메시지 전송 | `client.files.uploadV2()`, `client.chat.postMessage()` |
| Webhook | 버튼 클릭 응답 | `axios.post(response_url)` |
| Block Kit | 인터랙티브 UI | `blocks: [{ type: 'actions' }]` |

**왜 files.uploadV2()와 chat.postMessage()를 분리했나?**

초기 시도 ❌:
```javascript
await client.files.uploadV2({
  file: imageBuffer,
  blocks: [버튼]  // 함께 전송
});
// 결과: 버튼이 이미지보다 먼저 렌더링됨
```

최종 해결 ✅:
```javascript
await client.files.uploadV2({ file: imageBuffer, initial_comment: message });
await new Promise(resolve => setTimeout(resolve, 3000));  // 3초 대기
await client.chat.postMessage({ blocks: [버튼] });
// 결과: 항상 "이미지 → 버튼" 순서 보장
```

**핵심 메서드:**

```javascript
async uploadAndPostImageWithButton(channelId, imageBuffer, filename, message, referenceUrl) {
  // 1. 이미지 업로드
  await this.client.files.uploadV2({
    channel_id: channelId,
    file: imageBuffer,
    filename: filename,
    initial_comment: this.buildMessageWithReference(message, referenceUrl)
  });

  // 2. 3초 대기 (이미지 렌더링 보장)
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 3. 버튼 메시지 전송
  const blocks = [{
    type: 'actions',
    elements: [{
      type: 'button',
      text: { type: 'plain_text', text: '🎲 메뉴가 마음에 안 들어요' },
      action_id: 'change_lunch_menu'
    }]
  }];

  await this.client.chat.postMessage({ channel: channelId, blocks });
}
```

---

### 3. SlackInteractionServer (인터랙션 처리)

**파일 위치:** `src/server/index.js`

**Express 서버 구조:**

```javascript
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/slack/interactions', async (req, res) => {
  // Slack 3초 타임아웃 방지 위해 즉시 응답
  res.status(200).send();

  const payload = JSON.parse(req.body.payload);
  await this.handleInteraction(payload);
});
```

**버튼 클릭 처리 로직:**

```javascript
async handleChangeMenuAction(user, responseUrl, channel) {
  const today = new Date().toISOString().split('T')[0];
  const canUse = this.usageTracker.canUseToday(today);

  if (!canUse) {
    // 이미 사용됨 - 클릭한 사용자에게만 메시지
    await axios.post(responseUrl, {
      text: '⏰ *오늘은 이미 메뉴가 변경되었습니다!*\n내일 다시 시도해주세요.',
      response_type: 'ephemeral'  // 본인에게만 보임
    });
    return;
  }

  // 첫 사용 - 랜덤 메뉴 선택
  this.usageTracker.recordUsage(user.id, today);
  const randomMenu = this.getRandomMenu();

  // 채널 전체에 공개
  await axios.post(responseUrl, {
    text: `🎲 *오늘의 대체 메뉴가 선택되었습니다!*\n\n🍽️ **${randomMenu}**\n\n선택자: <@${user.id}>`,
    response_type: 'in_channel'  // 전체 공개
  });
}
```

**관리자 초기화 버튼:**

```javascript
async handleResetUsageAction(user, responseUrl, channel) {
  const today = new Date().toISOString().split('T')[0];
  const wasCleared = this.usageTracker.clearToday(today);

  if (wasCleared) {
    await axios.post(responseUrl, {
      text: `✅ *메뉴 변경 카운트가 초기화되었습니다!*\n\n초기화한 사람: <@${user.id}>`,
      response_type: 'in_channel'
    });
  } else {
    await axios.post(responseUrl, {
      text: '⚠️ 오늘은 아직 메뉴 변경이 없었습니다.',
      response_type: 'ephemeral'
    });
  }
}
```

---

### 4. UsageTracker (일일 사용 제한)

**파일 위치:** `src/services/usageTracker.js`

**데이터 구조:**
```json
{
  "2025-10-27": {
    "userId": "U12345ABC",
    "timestamp": "2025-10-27T03:45:12.345Z"
  },
  "2025-10-26": {
    "userId": "U67890DEF",
    "timestamp": "2025-10-26T04:12:33.123Z"
  }
}
```

**그룹 전체 제한 구현:**

```javascript
canUseToday(date) {
  // 날짜 키 존재 = 누군가 이미 사용 = false
  // 날짜 키 없음 = 아무도 사용 안 함 = true
  return !this.usageData[date];
}

recordUsage(userId, date) {
  if (!this.usageData[date]) {
    this.usageData[date] = {
      userId: userId,
      timestamp: new Date().toISOString()
    };
    this.saveData();
  }
}

clearToday(date) {
  if (this.usageData[date]) {
    delete this.usageData[date];
    this.saveData();
    return true;
  }
  return false;
}
```

**설계 변경 과정:**

초기 설계(개인별 제한):
```javascript
"2025-10-27": ["U123", "U456", "U789"]  // 각자 1번씩 가능
```

최종 설계(그룹 전체 제한):
```javascript
"2025-10-27": { userId: "U123", timestamp: "..." }  // 첫 클릭자만 저장, 이후 모두 차단
```

**자동 정리 메커니즘:**

```javascript
cleanOldData() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  Object.keys(this.usageData).forEach(date => {
    if (new Date(date) < sevenDaysAgo) {
      delete this.usageData[date];  // 7일 이상 된 기록 삭제
    }
  });

  this.saveData();
  this.logger.info(`🧹 Cleaned old usage data (older than 7 days)`);
}
```

생성자에서 즉시 실행되므로, 봇 시작할 때마다 7일 이상 된 기록 자동 삭제.

**파일 저장 방식:**

```javascript
saveData() {
  fs.writeFileSync(
    this.dataPath,
    JSON.stringify(this.usageData, null, 2),  // pretty-print
    'utf-8'
  );
}
```

**왜 데이터베이스를 안 쓰나?**
- ✅ 장점: 설정 불필요, 의존성 없음, 백업/복원 간단 (파일 복사)
- ⚠️ 단점: 동시성 제어 없음 (하지만 하루 1회 제한이므로 race condition 가능성 극히 낮음)
- 📊 적합한 이유: 데이터 양이 적고(~50건), 단순 key-value 조회

---

### 5. ngrok 터널링 (공개 URL 노출)

**파일 위치:** `src/index.js`

**문제:**
- 로컬 Express 서버(localhost:3000)는 Slack에서 접근 불가
- Slack Interactive Components는 공개 URL 필요

**해결:**
```javascript
async startTunnel() {
  const authtoken = process.env.NGROK_AUTHTOKEN;
  const domain = process.env.NGROK_DOMAIN;

  const forwardOptions = {
    addr: config.server.port,  // 3000
    authtoken: authtoken || undefined
  };

  if (domain) {
    forwardOptions.domain = domain;  // 정적 도메인 사용
    this.logger.info(`🔗 Using static ngrok domain: ${domain}`);
  }

  const listener = await ngrok.forward(forwardOptions);
  const publicUrl = listener.url();

  this.logger.info(`🌐 Public URL: ${publicUrl}`);
  this.logger.info(`📝 Slack App Request URL: ${publicUrl}/slack/interactions`);

  if (domain) {
    this.logger.info('🎉 FIXED URL - 매번 같은 URL입니다!');
  } else {
    this.logger.warn('⚠️ Random URL - 봇 재시작 시 Slack App 설정을 업데이트하세요.');
  }

  return publicUrl;
}
```

**정적 도메인의 장점:**
- ✅ 봇 재시작해도 URL 변경 없음
- ✅ Slack App 설정 한 번만 하면 됨 (Request URL 고정)
- ❌ 일반 ngrok: 매번 랜덤 URL (예: abc123.ngrok-free.app) → 매번 Slack App 재설정 필요

**환경 변수 설정:**
```env
NGROK_AUTHTOKEN=23ur3rRcefzduOuu852fH9dvSH9_5pceg97JvYbFaRsEJb5JZ
NGROK_DOMAIN=deirdre-nonsatirizing-nonsuppositionally.ngrok-free.dev
```

---

## ⚙️ 설정 관리 및 스케줄링

### 환경 변수 3계층 구조

```
.env (실제 값, git 제외)
  ↓
.env.example (템플릿, git 포함)
  ↓
src/config/index.js (검증 + 기본값)
```

**설정 파싱 예시:**
```javascript
// src/config/index.js
const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    channelId: process.env.SLACK_CHANNEL_ID,
    startupChannelId: process.env.SLACK_STARTUP_CHANNEL_ID || process.env.SLACK_CHANNEL_ID
  },
  kakao: {
    plusFriendUrl: process.env.KAKAO_PLUS_FRIEND_URL
  },
  scheduler: {
    cronExpression: process.env.SCHEDULE_CRON || '0 12 * * *'
  },
  lunch: {
    alternativeMenus: process.env.ALTERNATIVE_MENUS
      ? process.env.ALTERNATIVE_MENUS.split(',').map(m => m.trim())
      : ['김치찌개', '돈까스', '된장찌개', '비빔밥']  // 기본값
  },
  server: {
    port: parseInt(process.env.SERVER_PORT || '3000', 10)
  }
};

// 필수 값 검증
if (!config.slack.botToken) {
  throw new Error('SLACK_BOT_TOKEN is required in .env');
}

module.exports = config;
```

**`.env` 설정 예시:**
```env
# Slack 설정
SLACK_BOT_TOKEN=xoxb-your-actual-token-here
SLACK_CHANNEL_ID=C01234567
SLACK_STARTUP_CHANNEL_ID=C07654321

# 카카오톡 설정
KAKAO_PLUS_FRIEND_URL=https://pf.kakao.com/_your_friend_id

# 대체 메뉴 목록 (쉼표로 구분)
ALTERNATIVE_MENUS=김치찌개,돈까스,제육,뼈해장국,국밥,쌀국수,보쌈정식

# 스케줄 설정 (cron 표현식)
SCHEDULE_CRON=0 12 * * *

# ngrok 설정
NGROK_AUTHTOKEN=your_ngrok_authtoken
NGROK_DOMAIN=deirdre-nonsatirizing-nonsuppositionally.ngrok-free.dev

# 서버 설정
SERVER_PORT=3000
LOG_LEVEL=info
```

### node-cron 스케줄링

**파일 위치:** `src/scheduler/index.js`

```javascript
class TaskScheduler {
  constructor(cronExpression, task, logger) {
    this.cronExpression = cronExpression;
    this.task = task;
    this.logger = logger;
    this.job = null;
  }

  start(manualExecution = false) {
    if (manualExecution) {
      this.logger.info('⚡ Manual execution mode - running task immediately');
      this.task();
      return;
    }

    this.job = cron.schedule(this.cronExpression, () => {
      this.logger.info('⏰ Scheduled task triggered');
      this.task();
    }, {
      scheduled: true,
      timezone: 'Asia/Seoul'  // 중요!
    });

    this.logger.info(`📅 Scheduler started with cron: ${this.cronExpression}`);
    this.logger.info(`🌏 Timezone: Asia/Seoul`);
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.logger.info('⏹️ Scheduler stopped');
    }
  }
}
```

**Cron 표현식:** `"0 12 * * *"`
```
┌─ 분 (0-59)
│ ┌─ 시 (0-23)
│ │ ┌─ 일 (1-31)
│ │ │ ┌─ 월 (1-12)
│ │ │ │ ┌─ 요일 (0-7, 0과 7은 일요일)
│ │ │ │ │
0 12 * * *  → 매일 12시 0분
```

**타임존의 중요성:**
- 서버가 UTC로 동작하는 경우: UTC 12:00 = 한국 21:00 (저녁 9시)
- `timezone: 'Asia/Seoul'` 없으면 잘못된 시간에 실행됨

**수동 실행 모드:**
```bash
# 정상 실행 (스케줄에 따라 매일 12시)
npm start

# 테스트 모드 (즉시 실행)
npm start -- --test
```

```javascript
// src/index.js
if (process.argv.includes('--test')) {
  logger.info('🧪 Test mode activated');
  await bot.runManualExecution();
} else {
  await bot.start();
}
```

---

## 🛡️ 에러 처리 및 로깅

### Winston 로깅 시스템

**파일 위치:** `src/utils/logger.js`

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // 에러 로그만 별도 파일
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880,  // 5MB
      maxFiles: 5
    }),

    // 모든 로그
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5
    }),

    // 콘솔 출력
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

module.exports = logger;
```

**로그 레벨 계층:**
```
error (0) - 치명적 오류 (bot 중단 가능)
  ↓
warn (1) - 주의 필요 (기능은 동작)
  ↓
info (2) - 정상 동작 정보
  ↓
debug (3) - 상세 디버깅 정보
```

### 3단계 에러 대응 시스템

```javascript
async executeTask() {
  try {
    logger.info('📸 Starting profile image scraping...');
    const imageBuffer = await this.scraper.scrapeProfileImage();

    logger.info('📤 Uploading to Slack...');
    await this.slackClient.uploadAndPostImageWithButton(
      this.config.slack.channelId,
      imageBuffer,
      'lunch-menu.png',
      '🍽️ 오늘의 점심 메뉴입니다!',
      this.config.kakao.plusFriendUrl
    );

    logger.info('✅ Task completed successfully');

  } catch (error) {
    // 1단계: 로그 파일 기록
    logger.error('❌ Task execution failed:', {
      message: error.message,
      stack: error.stack
    });

    // 2단계: 콘솔 출력
    console.error('Task failed:', error);

    // 3단계: Slack 알림
    try {
      await this.slackClient.postMessage(
        this.config.slack.startupChannelId,
        `🚨 *봇 실행 중 오류 발생*\n\n\`\`\`${error.message}\`\`\`\n\n스택 트레이스:\n\`\`\`${error.stack}\`\`\``
      );
    } catch (notificationError) {
      logger.error('Failed to send error notification to Slack:', notificationError);
    }
  }
}
```

### Slack 3초 타임아웃 해결

```javascript
app.post('/slack/interactions', async (req, res) => {
  try {
    // 즉시 200 응답 (Slack 3초 타임아웃 방지)
    res.status(200).send();

    const payload = JSON.parse(req.body.payload);

    // 실제 처리는 비동기로
    await this.handleInteraction(payload);

  } catch (error) {
    logger.error('❌ Interaction handling failed:', error);

    // Slack에 이미 200을 보냈으므로 response_url로 에러 메시지 전송
    try {
      await axios.post(payload.response_url, {
        text: '⚠️ 처리 중 오류가 발생했습니다. 관리자에게 문의하세요.',
        response_type: 'ephemeral'
      });
    } catch (responseError) {
      logger.error('Failed to send error response:', responseError);
    }
  }
});
```

**왜 즉시 200을 보내나?**
- Slack은 인터랙션 요청에 대해 **3초 이내 응답** 요구
- 랜덤 메뉴 선택 + DB 저장 + Slack API 호출 = 1-2초 소요 가능
- 타임아웃 위험을 피하기 위해 먼저 200 응답
- 실제 처리는 비동기로 진행
- 에러 발생 시 `response_url`로 별도 전송

### 리소스 정리

```javascript
async cleanup() {
  logger.info('🧹 Cleaning up resources...');

  if (this.scraper && this.scraper.browser) {
    await this.scraper.browser.close();
    logger.info('✅ Puppeteer browser closed');
  }

  if (this.scheduler) {
    this.scheduler.stop();
    logger.info('✅ Scheduler stopped');
  }

  if (this.interactionServer) {
    await this.interactionServer.stop();
    logger.info('✅ Interaction server stopped');
  }
}

// Process 종료 시그널 처리
process.on('SIGINT', async () => {
  logger.info('📴 Received SIGINT signal');
  await bot.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('📴 Received SIGTERM signal');
  await bot.cleanup();
  process.exit(0);
});
```

Puppeteer는 메모리를 많이 사용하므로 반드시 `close()` 호출 필요.

---

## 🚀 배포 및 확장성

### 현재 배포 방식

```
개발자 PC
├── npm start (Node.js 프로세스)
├── Express :3000
└── ngrok 터널 → 공개 URL (deirdre-nonsatirizing-nonsuppositionally.ngrok-free.dev)
```

**장점:**
- ✅ 설정 간단, 비용 무료
- ✅ 로컬 디버깅 용이
- ✅ 코드 수정 후 즉시 재시작 가능

**단점:**
- ❌ PC 꺼지면 봇 중단
- ❌ 인터넷 연결 필수
- ❌ ngrok 무료 플랜 제한 (연결 수, 대역폭)

### 프로덕션 배포 옵션

| 플랫폼 | 장점 | 단점 | 비용 |
|--------|------|------|------|
| **AWS EC2** | 가장 유연, 완전한 제어 | 설정 복잡, 유지보수 필요 | ~$5/월 (t3.micro) |
| **AWS Lightsail** | 간단한 설정, 고정 IP | EC2보다 제한적 | $3.50/월 |
| **Heroku** | 쉬운 배포, Git 통합 | 유료 전환 필요 | $7/월 |
| **Railway** | 무료 티어, 간단한 배포 | 제한적 리소스 | 무료/$5/월 |
| **Render** | 무료 티어, 자동 배포 | 콜드 스타트 있음 | 무료/$7/월 |
| **Google Cloud Run** | 컨테이너 기반, 자동 스케일링 | 학습 곡선 있음 | 종량제 |

### PM2를 사용한 프로세스 관리

**설치:**
```bash
npm install -g pm2
```

**실행:**
```bash
# 시작
pm2 start src/index.js --name lunch-bot

# 로그 확인
pm2 logs lunch-bot

# 재시작
pm2 restart lunch-bot

# 중지
pm2 stop lunch-bot

# 서버 재부팅 시 자동 시작 설정
pm2 startup
pm2 save
```

**ecosystem.config.js 설정:**
```javascript
module.exports = {
  apps: [{
    name: 'lunch-bot',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

실행:
```bash
pm2 start ecosystem.config.js
```

### 클라우드 배포 시 고려사항

**1. ngrok 대체**
- 클라우드에서는 공개 IP가 있으므로 ngrok 불필요
- Express 서버를 직접 노출 (HTTPS 설정 필요)
- Let's Encrypt로 무료 SSL 인증서 발급

**2. 환경 변수 관리**
- `.env` 파일을 서버에 업로드하지 말고 플랫폼 설정에서 관리
- AWS: Systems Manager Parameter Store
- Heroku/Railway: Dashboard에서 환경 변수 설정

**3. 로그 관리**
- 파일 로그 대신 표준 출력(stdout) 사용
- 클라우드 로깅 서비스 활용 (CloudWatch, Papertrail)

### 확장 시나리오

**현재:** 단일 채널
**확장:** 다중 채널 지원

```javascript
// config/channels.js
const channels = [
  {
    id: 'C01234567',
    name: 'team-lunch',
    kakaoUrl: 'https://pf.kakao.com/_friend1',
    menus: ['김치찌개', '돈까스', '제육'],
    schedule: '0 12 * * *'  // 매일 12시
  },
  {
    id: 'C07654321',
    name: 'dev-lunch',
    kakaoUrl: 'https://pf.kakao.com/_friend2',
    menus: ['쌀국수', '국밥', '보쌈정식'],
    schedule: '0 12 * * 1-5'  // 평일만 12시
  }
];

// src/index.js
class MultiChannelBot {
  constructor(channels) {
    this.channels = channels;
    this.trackers = new Map();
    this.schedulers = [];

    channels.forEach(channel => {
      // 채널별 독립적인 UsageTracker
      this.trackers.set(
        channel.id,
        new UsageTracker(`data/usage-${channel.id}.json`)
      );

      // 채널별 독립적인 스케줄러
      const scheduler = new TaskScheduler(
        channel.schedule,
        () => this.executeTaskForChannel(channel),
        logger
      );

      this.schedulers.push(scheduler);
    });
  }

  async executeTaskForChannel(channel) {
    const scraper = new KakaoScraper(channel.kakaoUrl);
    const imageBuffer = await scraper.scrapeProfileImage();

    await this.slackClient.uploadAndPostImageWithButton(
      channel.id,
      imageBuffer,
      `lunch-menu-${channel.name}.png`,
      `🍽️ ${channel.name} 오늘의 점심 메뉴!`,
      channel.kakaoUrl
    );
  }
}
```

### 성능 최적화 가능성

**1. 이미지 캐싱**
```javascript
class ImageCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    const cached = this.cache.get(key);
    if (cached && this.isValid(cached)) {
      return cached.data;
    }
    return null;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  isValid(cached) {
    const ONE_HOUR = 60 * 60 * 1000;
    return (Date.now() - cached.timestamp) < ONE_HOUR;
  }
}

// 사용
const today = new Date().toISOString().split('T')[0];
const cacheKey = `${url}-${today}`;

let imageBuffer = imageCache.get(cacheKey);
if (!imageBuffer) {
  imageBuffer = await scraper.scrapeProfileImage();
  imageCache.set(cacheKey, imageBuffer);
}
```

**2. Puppeteer 인스턴스 재사용**
```javascript
// 현재: 매번 브라우저 실행/종료
async scrapeProfileImage() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  // ...
  await browser.close();
}

// 최적화: 브라우저 재사용
class OptimizedKakaoScraper {
  constructor(url) {
    this.url = url;
    this.browser = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({ headless: true });
    }
  }

  async scrapeProfileImage() {
    await this.init();
    const page = await this.browser.newPage();
    // ... 스크래핑 로직
    await page.close();  // 페이지만 닫고 브라우저는 유지
    return imageBuffer;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
```

**트레이드오프:**
- ✅ 장점: 브라우저 실행 시간 절약 (3-5초 → 0.5초)
- ❌ 단점: 메모리 사용량 증가 (~100MB), 장기 실행 시 불안정
- 📊 결론: 현재 방식(매번 재시작)이 안정성 측면에서 우수

**3. 데이터베이스 도입 시점**

현재 JSON 파일 방식의 한계:
- 채널 수 >10개 → 파일 관리 복잡
- 통계/분석 기능 추가 시 (인기 메뉴 랭킹)
- 사용자별 선호도 추적 필요 시

PostgreSQL 스키마 예시:
```sql
CREATE TABLE channels (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100),
  kakao_url TEXT,
  menus TEXT[]
);

CREATE TABLE menu_selections (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(20) REFERENCES channels(id),
  user_id VARCHAR(20),
  selected_menu VARCHAR(100),
  selected_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_selections_date ON menu_selections(selected_at);
CREATE INDEX idx_selections_channel ON menu_selections(channel_id);

-- 인기 메뉴 통계
SELECT selected_menu, COUNT(*) as count
FROM menu_selections
WHERE selected_at > NOW() - INTERVAL '30 days'
GROUP BY selected_menu
ORDER BY count DESC;
```

---

## 🔒 보안 고려사항

### 1. 환경 변수 보호

**절대 금지:**
```javascript
// ❌ 코드에 토큰 하드코딩
const SLACK_TOKEN = 'xoxb-1234567890-abcdefg';
```

**올바른 방법:**
```javascript
// ✅ 환경 변수 사용
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
```

**.gitignore 필수:**
```gitignore
.env
.env.local
.env.production
logs/
data/usage.json
```

### 2. Slack 서명 검증 (권장 추가)

현재 미구현이지만 보안 강화를 위해 추가 권장:

```javascript
const crypto = require('crypto');

function verifySlackRequest(req, signingSecret) {
  const slackSignature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];

  // 타임스탬프 검증 (5분 이내 요청만 허용)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - timestamp) > 60 * 5) {
    return false;
  }

  // 서명 검증
  const sigBasestring = `v0:${timestamp}:${req.rawBody}`;
  const mySignature = 'v0=' +
    crypto.createHmac('sha256', signingSecret)
      .update(sigBasestring)
      .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(slackSignature)
  );
}

// 미들웨어로 적용
app.post('/slack/interactions', (req, res, next) => {
  if (!verifySlackRequest(req, process.env.SLACK_SIGNING_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  next();
});
```

이를 통해 Slack이 아닌 다른 곳에서 오는 악의적 요청 차단.

### 3. Rate Limiting

Express Rate Limit 사용:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15분
  max: 100,  // IP당 최대 100 요청
  message: 'Too many requests from this IP'
});

app.use('/slack/interactions', limiter);
```

---

## 📊 모니터링 및 알림

### 현재 구현

- ✅ Winston 파일 로그 (`logs/error.log`, `logs/combined.log`)
- ✅ Slack 에러 알림
- ✅ 콘솔 출력

### 추가 가능한 모니터링

**1. Sentry (에러 추적)**
```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development'
});

// 에러 발생 시
Sentry.captureException(error);
```

**2. 일일 통계 리포트**
```javascript
async sendDailyReport() {
  const today = new Date().toISOString().split('T')[0];
  const usage = this.usageTracker.usageData[today];

  const report = {
    date: today,
    menuChanged: usage ? 'Yes' : 'No',
    selectedMenu: usage ? usage.selectedMenu : 'N/A',
    selectedBy: usage ? `<@${usage.userId}>` : 'N/A'
  };

  await this.slackClient.postMessage(
    this.config.slack.startupChannelId,
    `📊 *일일 리포트*\n\n` +
    `날짜: ${report.date}\n` +
    `메뉴 변경: ${report.menuChanged}\n` +
    `선택된 메뉴: ${report.selectedMenu}\n` +
    `선택한 사람: ${report.selectedBy}`
  );
}

// 매일 오후 6시 리포트 전송
cron.schedule('0 18 * * *', () => {
  this.sendDailyReport();
}, { timezone: 'Asia/Seoul' });
```

---

## 📈 요약 및 결론

### 시스템 특징 요약

| 측면 | 현재 구현 | 장점 | 제약사항 |
|------|-----------|------|----------|
| **아키텍처** | 5계층 모듈화 | 명확한 관심사 분리, 유지보수 용이 | 단일 프로세스 |
| **데이터 수집** | Puppeteer 스크래핑 | API 없이도 동작 가능 | 선택자 변경에 취약 |
| **메시징** | Slack Web API + Block Kit | 인터랙티브 UI, 실시간 반응 | Slack 플랫폼 종속 |
| **사용 제한** | 파일 기반 JSON | 설정 불필요, 백업 간단 | 동시성 제어 없음 |
| **스케줄링** | node-cron | 타임존 지원, 유연한 설정 | 단일 스케줄만 지원 |
| **배포** | 로컬 + ngrok | 무료, 개발 간편 | PC 의존, 안정성 낮음 |
| **에러 처리** | Winston + Slack 알림 | 3단계 대응, 실시간 알림 | 고급 모니터링 없음 |

### 적합한 사용 사례

이 시스템은 다음 요구사항에 최적화되어 있습니다:

- ✅ 소규모 팀 (1-5개 채널)
- ✅ 하루 1-2회 정기 실행
- ✅ 간단한 유지보수
- ✅ 빠른 프로토타이핑
- ✅ 비용 최소화

### 확장이 필요한 시점

다음 상황에서 아키텍처 재검토가 필요합니다:

- 📊 채널 수 >10개 → 데이터베이스 도입
- 🌐 24/7 운영 필요 → 클라우드 배포
- 📈 고급 기능 (통계, 추천 알고리즘) → 아키텍처 재설계
- 👥 사용자 수 >100명 → 성능 최적화 및 캐싱
- 🔒 엔터프라이즈 보안 요구사항 → 인증/인가 시스템 강화

### 향후 개선 방향

**단기 (1-2주):**
1. Slack 서명 검증 추가
2. Rate limiting 구현
3. 이미지 캐싱 시스템

**중기 (1-2개월):**
1. 다중 채널 지원
2. 통계 대시보드
3. 클라우드 배포 (AWS/Railway)

**장기 (3-6개월):**
1. PostgreSQL 데이터베이스
2. 사용자 선호도 학습
3. 관리자 웹 대시보드
4. 메뉴 추천 알고리즘

---

## 🔗 관련 문서

- [README.md](./README.md) - 기본 사용법 및 설정 가이드
- [CLAUDE.md](./CLAUDE.md) - 프로젝트 개요
- [.env.example](./.env.example) - 환경 변수 템플릿

## 📝 라이선스

이 프로젝트는 개인/팀 내부 사용을 위해 작성되었습니다.
