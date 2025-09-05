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