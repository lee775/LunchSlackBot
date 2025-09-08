const config = require('./config');
const logger = require('./utils/logger');
const KakaoScraper = require('./services/kakaoScraper');
const SlackClient = require('./services/slackClient');
const TaskScheduler = require('./scheduler');
const OCRService = require('./services/ocrService');

class KakaoSlackBot {
  constructor() {
    this.kakaoScraper = new KakaoScraper();
    this.slackClient = new SlackClient(config.slack.botToken);
    this.scheduler = new TaskScheduler();
    this.ocrService = new OCRService();
    this.isRunning = false;
  }

  async initialize() {
    try {
      logger.info('Initializing Kakao-Slack Bot...');

      // Slack 연결 테스트
      const slackTest = await this.slackClient.testConnection();
      logger.info(`Connected to Slack team: ${slackTest.team}`);

      // 채널 정보 확인 건너뛰기 (권한 문제 방지)
      logger.info(`Using Slack channel: ${config.slack.channelId}`);

      // 스케줄 작업 등록
      this.scheduler.addTask(
        'daily-profile-sync',
        config.schedule.cron,
        () => this.syncProfileImage(),
        {
          timezone: 'Asia/Seoul',
          onError: (error, taskName) => this.handleTaskError(error, taskName)
        }
      );

      logger.info('Bot initialized successfully');
      this.isRunning = true;
      
      // 봇 시작 알림 메시지 전송
      await this.sendStartupNotification();
      
    } catch (error) {
      logger.error('Failed to initialize bot:', error);
      throw error;
    }
  }

  async sendStartupNotification() {
    try {
      const message = `🚀 *점심메뉴 봇이 시작되었습니다!*\n\n` +
                    `📅 시작시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n` +
                    `⏰ 매일 12시에 점심메뉴를 확인해드립니다\n` +
                    `🔗 모니터링 대상: ${config.kakao.plusFriendUrl}\n\n` +
                    `✨ 맛있는 점심시간을 기대해주세요!`;

      await this.slackClient.sendMessage(config.slack.startupChannelId, message);
      logger.info('Startup notification sent to Slack');
      
    } catch (error) {
      logger.error('Failed to send startup notification:', error);
      // 시작 알림 실패해도 봇은 계속 동작
    }
  }

  async syncProfileImage() {
    logger.info('Starting profile image sync...');
    
    try {
      // 1. 카카오톡 플러스친구 프로필 이미지 가져오기
      logger.info('Fetching profile image from KakaoTalk Plus Friend...');
      const profileData = await this.kakaoScraper.getProfileImage(config.kakao.plusFriendUrl);
      
      if (!profileData || !profileData.buffer) {
        throw new Error('Failed to get profile image data');
      }

      logger.info(`Profile data fetched using method: ${profileData.method}`);

      // 2. 점심메뉴 메시지 준비
      const today = new Date();
      const dayOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][today.getDay()];
      const todayDate = today.toLocaleDateString('ko-KR');
      
      const message = `🍽️ *오늘의 점심메뉴입니다!*\n\n` +
                    `📅 ${todayDate} (${dayOfWeek})\n` +
                    `⏰ 점심시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n` +
                    `🏪 윤쉐프 코오롱 점심메뉴를 확인해주세요!\n\n` +
                    `🍚 맛있는 식사 되세요! 🥢`;

      // 3. Slack에 점심메뉴 이미지 업로드 및 전송
      logger.info('Uploading lunch menu image to Slack...');
      const uploadResult = await this.slackClient.uploadAndPostImage(
        config.slack.lunchChannelId,
        profileData.buffer,
        `lunch_menu_${new Date().toISOString().split('T')[0]}.${profileData.method === 'screenshot' ? 'png' : 'jpg'}`,
        message,
        config.kakao.plusFriendUrl
      );

      if (uploadResult.success) {
        logger.info(`Profile sync completed successfully. File ID: ${uploadResult.fileId}`);
        return {
          success: true,
          timestamp: new Date().toISOString(),
          fileId: uploadResult.fileId,
          permalink: uploadResult.permalink
        };
      } else {
        throw new Error('Failed to upload image to Slack');
      }

    } catch (error) {
      logger.error('Profile sync failed:', error);
      
      // 에러 알림을 Slack으로 전송
      try {
        await this.slackClient.sendMessage(
          config.slack.lunchChannelId,
          `❌ *오늘의 점심메뉴 가져오기 실패*\n\n🕒 실패 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n📝 오류 내용: ${error.message}\n\n😔 죄송합니다. 점심메뉴를 확인할 수 없습니다.`
        );
      } catch (slackError) {
        logger.error('Failed to send error notification to Slack:', slackError);
      }
      
      throw error;
    }
  }

  async handleTaskError(error, taskName) {
    logger.error(`Task error handler called for '${taskName}':`, error);
    
    try {
      await this.slackClient.sendMessage(
        config.slack.channelId,
        `🚨 *스케줄 작업 실패 알림*\n\n📋 작업명: ${taskName}\n🕒 실패 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n📝 오류 내용: ${error.message}`
      );
    } catch (slackError) {
      logger.error('Failed to send task error notification to Slack:', slackError);
    }
  }

  async start() {
    if (!this.isRunning) {
      await this.initialize();
    }

    logger.info(`Starting scheduled tasks with cron: ${config.schedule.cron}`);
    this.scheduler.startAllTasks();
    
    logger.info('Kakao-Slack Bot started successfully');
    logger.info(`Next execution will be at: ${this.getNextExecutionTime()}`);
  }

  async stop() {
    logger.info('Stopping Kakao-Slack Bot...');
    
    this.scheduler.stopAllTasks();
    await this.kakaoScraper.close();
    await this.ocrService.close();
    this.isRunning = false;
    
    logger.info('Bot stopped');
  }

  // 즉시 실행 (테스트용)
  async runNow() {
    if (!this.isRunning) {
      await this.initialize();
    }
    
    logger.info('Running profile sync immediately...');
    return await this.syncProfileImage();
  }

  getNextExecutionTime() {
    // cron 표현식을 파싱해서 다음 실행 시간 계산 (간단한 버전)
    const cron = require('node-cron');
    return 'Scheduled according to cron expression: ' + config.schedule.cron;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      scheduledTasks: this.scheduler.getAllTasksStatus(),
      config: {
        schedule: config.schedule.cron,
        kakaoUrl: config.kakao.plusFriendUrl,
        slackChannel: config.slack.channelId
      }
    };
  }
}

// 메인 실행 부분
async function main() {
  const bot = new KakaoSlackBot();
  
  // 프로세스 종료 시 정리
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
  });

  // 처리되지 않은 예외 처리
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  try {
    // 명령줄 인수 확인
    const args = process.argv.slice(2);
    
    if (args.includes('--test') || args.includes('-t')) {
      // 테스트 실행
      logger.info('Running in test mode...');
      const result = await bot.runNow();
      logger.info('Test completed:', result);
    } else if (args.includes('--status') || args.includes('-s')) {
      // 상태 확인
      await bot.initialize();
      const status = bot.getStatus();
      console.log(JSON.stringify(status, null, 2));
    } else {
      // 일반 실행
      await bot.start();
      
      // 프로그램이 종료되지 않도록 유지
      logger.info('Bot is running... Press Ctrl+C to stop.');
    }
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
  main();
}

module.exports = KakaoSlackBot;