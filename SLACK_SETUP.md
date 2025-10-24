# Slack Interactive Components 설정 가이드

## 🎉 초간단 2단계 설정 (비밀번호 입력 필요 없음!)

### 1단계: ngrok authtoken 설정 (최초 1회만)

1. https://dashboard.ngrok.com/signup 접속 (무료 가입)
2. https://dashboard.ngrok.com/get-started/your-authtoken 에서 authtoken 복사
3. `.env` 파일에 추가:
   ```
   NGROK_AUTHTOKEN=your_authtoken_here
   ```

---

### 2단계: 봇 실행 (ngrok 자동 시작!)

```bash
npm start
```

**콘솔에 다음과 같은 URL이 자동으로 표시됩니다:**
```
================================================
🌐 PUBLIC URL CREATED! (ngrok)
================================================
Public URL: https://abc-123.ngrok-free.app
Slack Interactive URL: https://abc-123.ngrok-free.app/slack/interactions

✅ NO PASSWORD REQUIRED!
   ngrok은 비밀번호 없이 바로 사용 가능합니다!
================================================
```

⚠️ **URL을 복사하세요!** (authtoken 설정 후에는 매번 동일)

---

### 3단계: Slack App 설정

1. https://api.slack.com/apps 접속
2. 앱 선택
3. 왼쪽 메뉴: **Interactivity & Shortcuts**
4. **Interactivity** 켜기 (ON)
5. **Request URL** 입력:
   ```
   https://abc-123.ngrok-free.app/slack/interactions
   ```
6. **Save Changes** 클릭

✅가 표시되면 성공!

---

### 완료! 이제 테스트해보세요

버튼을 눌러서 랜덤 메뉴가 나오면 성공입니다! 🎉

---

## 문제 해결

### "authtoken required" 에러
- `.env` 파일에 `NGROK_AUTHTOKEN`이 설정되어 있는지 확인
- ngrok 가입 후 authtoken을 정확히 복사했는지 확인

### "We had trouble connecting" 에러
- URL에 `/slack/interactions`가 포함되었는지 확인
- ngrok 터널이 실행 중인지 확인 (`npm start` 로그 확인)

### 버튼 클릭 시 "구성되지 않음" 에러
- Slack App에서 Interactivity가 켜져있는지 확인
- Request URL이 저장되었는지 확인

---

## ngrok의 장점

✅ **비밀번호 입력 필요 없음** - 브라우저 확인 단계 불필요
✅ **안정적인 URL** - authtoken 사용 시 재시작해도 URL 유지 가능
✅ **빠른 속도** - localtunnel보다 안정적이고 빠름
✅ **무료 플랜** - 기본 기능은 완전 무료

---

## 프로덕션 환경

로컬 개발이 아닌 실제 서버에서는:

1. 서버 IP/도메인 사용
2. 방화벽에서 포트 3000 오픈
3. Request URL: `http://your-server-ip:3000/slack/interactions`

또는 nginx 등으로 리버스 프록시 설정 권장
