require('dotenv').config();

const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    channelId: process.env.SLACK_CHANNEL_ID, // 기존 호환성
    startupChannelId: process.env.SLACK_STARTUP_CHANNEL_ID || process.env.SLACK_CHANNEL_ID,
    lunchChannelId: process.env.SLACK_LUNCH_CHANNEL_ID || process.env.SLACK_CHANNEL_ID,
  },
  kakao: {
    plusFriendUrl: process.env.KAKAO_PLUS_FRIEND_URL,
  },
  schedule: {
    cron: process.env.SCHEDULE_CRON || '0 9 * * *', // 매일 오전 9시
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  server: {
    port: parseInt(process.env.SERVER_PORT || '3000', 10),
  },
  lunch: {
    alternativeMenus: process.env.ALTERNATIVE_MENUS
      ? process.env.ALTERNATIVE_MENUS.split(',').map(m => m.trim())
      : [
          '김치찌개',
          '된장찌개',
          '부대찌개',
          '비빔밥',
          '제육볶음',
          '돈까스',
          '불고기',
          '삼겹살',
          '치킨',
          '피자',
          '파스타',
          '햄버거',
          '초밥',
          '라멘',
          '쌀국수',
          '중화백반'
        ],
    // 특정 요일에 제외할 메뉴 (0=일요일, 1=월요일, ..., 6=토요일)
    excludedMenusByDay: {
      1: ['중화백반'],  // 월요일
      4: ['중화백반']   // 목요일
    },
    // 실내 메뉴 (눈 오거나 영하 5도 이하일 때 구내식당 대신 선택)
    indoorMenus: process.env.INDOOR_MENUS
      ? process.env.INDOOR_MENUS.split(',').map(m => m.trim())
      : ['한우마당', '솔탄', '미켈고깃집', '유미카츠', '소공동뚝배기', '중화백반'],
  },
  weather: {
    // 한파 기준 온도 (이 온도 이하면 실내 메뉴만)
    coldThreshold: parseInt(process.env.WEATHER_COLD_THRESHOLD || '-5', 10),
    // 날씨 체크 활성화 여부
    enabled: process.env.WEATHER_CHECK_ENABLED !== 'false',
  },
};

// 필수 환경변수 검증
const requiredEnvVars = [
  'SLACK_BOT_TOKEN',
  'SLACK_CHANNEL_ID',
  'KAKAO_PLUS_FRIEND_URL',
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

module.exports = config;