const config = require('./config');
const logger = require('./utils/logger');
const KakaoScraper = require('./services/kakaoScraper');
const SlackClient = require('./services/slackClient');
const TaskScheduler = require('./scheduler');
const OCRService = require('./services/ocrService');
const UsageTracker = require('./services/usageTracker');
const SlackInteractionServer = require('./server');
const WeatherService = require('./services/weatherService');
const ngrok = require('@ngrok/ngrok');

class KakaoSlackBot {
  constructor() {
    this.kakaoScraper = new KakaoScraper();
    this.slackClient = new SlackClient(config.slack.botToken);
    this.scheduler = new TaskScheduler();
    this.ocrService = new OCRService();
    this.usageTracker = new UsageTracker();
    this.interactionServer = new SlackInteractionServer(this.slackClient, this.usageTracker);
    this.weatherService = new WeatherService();
    this.tunnel = null;
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

      // 인터랙티브 서버 시작
      await this.interactionServer.start();
      logger.info('Slack interaction server started');

      // Localtunnel 시작 (공개 URL 생성)
      await this.startTunnel();

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

  async startTunnel() {
    try {
      logger.info('Starting ngrok tunnel for public URL...');

      // ngrok authtoken과 domain 설정
      const authtoken = process.env.NGROK_AUTHTOKEN;
      const domain = process.env.NGROK_DOMAIN;

      // ngrok 터널 시작 옵션
      const forwardOptions = {
        addr: config.server.port,
        authtoken: authtoken || undefined,
        authtoken_from_env: true
      };

      // Static domain이 설정되어 있으면 사용
      if (domain) {
        forwardOptions.domain = domain;
      }

      const listener = await ngrok.forward(forwardOptions);

      const publicUrl = listener.url();
      const slackInteractionUrl = `${publicUrl}/slack/interactions`;

      this.tunnel = listener;

      logger.info('');
      logger.info('================================================');
      if (domain) {
        logger.info('🌐 FIXED URL CREATED! (ngrok static domain)');
      } else {
        logger.info('🌐 PUBLIC URL CREATED! (ngrok)');
      }
      logger.info('================================================');
      logger.info(`Public URL: ${publicUrl}`);
      logger.info(`Slack Interactive URL: ${slackInteractionUrl}`);
      logger.info('');
      logger.info('✅ NO PASSWORD REQUIRED!');
      logger.info('   ngrok은 비밀번호 없이 바로 사용 가능합니다!');
      logger.info('');
      if (domain) {
        logger.info('🎉 FIXED URL - 매번 같은 URL입니다!');
        logger.info('   Slack App에 한 번만 설정하면 됩니다!');
        logger.info('');
      }
      logger.info('⚠️  SLACK APP 설정 (최초 1회만):');
      logger.info('');
      logger.info('1. Slack App 설정 페이지 접속:');
      logger.info('   https://api.slack.com/apps');
      logger.info('');
      logger.info('2. Interactivity & Shortcuts 메뉴 선택');
      logger.info('');
      logger.info('3. Interactivity 켜기 (ON)');
      logger.info('');
      logger.info('4. Request URL 입력:');
      logger.info(`   ${slackInteractionUrl}`);
      logger.info('');
      logger.info('5. Save Changes 클릭');
      logger.info('');
      if (!domain) {
        logger.info('💡 TIP: ngrok static domain을 설정하면 URL이 고정됩니다!');
        logger.info('   1. https://dashboard.ngrok.com/cloud-edge/domains 접속');
        logger.info('   2. Create Domain 클릭 (무료)');
        logger.info('   3. .env 파일에 NGROK_DOMAIN=your-domain 추가');
        logger.info('');
      }
      logger.info('================================================');
      logger.info('');

    } catch (error) {
      logger.error('Failed to start ngrok tunnel:', error);
      logger.warn('봇은 정상 작동하지만, 버튼 기능은 Slack App 설정 후 사용 가능합니다.');

      if (error.message && error.message.includes('authtoken')) {
        logger.error('');
        logger.error('❌ ngrok authtoken이 필요합니다!');
        logger.error('');
        logger.error('해결 방법:');
        logger.error('1. https://dashboard.ngrok.com/signup 에서 무료 가입');
        logger.error('2. authtoken 복사');
        logger.error('3. .env 파일에 추가: NGROK_AUTHTOKEN=your_token_here');
        logger.error('');
      }
    }
  }

  async sendStartupNotification() {
    try {
      const message = `🚀 *점심메뉴 봇이 시작되었습니다!*\n\n` +
                    `📅 시작시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n` +
                    `⏰ 매일 12시에 점심메뉴를 확인해드립니다\n` +
                    `🔗 모니터링 대상: ${config.kakao.plusFriendUrl}\n\n` +
                    `✨ 맛있는 점심시간을 기대해주세요!`;

      await this.slackClient.sendMessageWithButton(
        config.slack.startupChannelId,
        message,
        '🎲 오늘의 메뉴 변경 (테스트)',
        'test_change_menu',
        'primary'
      );
      logger.info('Startup notification with reset button sent to Slack');

    } catch (error) {
      logger.error('Failed to send startup notification:', error);
      // 시작 알림 실패해도 봇은 계속 동작
    }
  }

  async syncProfileImage() {
    logger.info('Starting today menu sync...');

    try {
      // 0. 날씨 정보 먼저 가져오기 (한 번만 호출)
      let currentTemperature = null;
      let weatherDescription = null;
      let weatherCheck = null;

      if (config.weather?.enabled) {
        logger.info('Checking weather for indoor menu recommendation...');
        weatherCheck = await this.weatherService.checkIndoorWeather(config.weather.coldThreshold);

        // 날씨 정보 저장 (나중에 메시지에 사용)
        if (weatherCheck.weather && !weatherCheck.weather.error) {
          currentTemperature = weatherCheck.weather.temperature;
          weatherDescription = weatherCheck.weather.description;
        }

        if (weatherCheck.shouldStayIndoor) {
          // 실내 메뉴 랜덤 선택
          const indoorMenus = config.lunch.indoorMenus || [];
          const today = new Date();
          const dayOfWeek = today.getDay();
          const todayStr = today.toISOString().split('T')[0];
          const excludedMenus = config.lunch.excludedMenusByDay?.[dayOfWeek] || [];
          const availableIndoorMenus = indoorMenus.filter(m => !excludedMenus.includes(m));

          if (availableIndoorMenus.length > 0) {
            const selectedMenu = availableIndoorMenus[Math.floor(Math.random() * availableIndoorMenus.length)];
            logger.info(`Indoor menu selected due to weather: ${selectedMenu}`);

            // usageTracker에 메뉴 저장 (버튼으로 변경 가능하도록)
            this.usageTracker.setPreviewMenuWithWeather(todayStr, selectedMenu, {
              reason: weatherCheck.reason,
              temperature: weatherCheck.weather.temperature,
              description: weatherCheck.weather.description,
              isIndoorOnly: true
            });
            this.usageTracker.confirmMenu(todayStr);

            // 날씨가 안좋으면 구내식당 메뉴판 없이 바로 실내 메뉴 추천만 전송
            const dayName = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][dayOfWeek];
            const todayDate = today.toLocaleDateString('ko-KR');

            const message = `🍽️ *오늘의 점심 추천!*\n\n` +
                          `📅 ${todayDate} (${dayName})\n\n` +
                          `${weatherCheck.reason}\n\n` +
                          `🏠 *오늘은 따뜻한 실내에서 식사하세요!*\n\n` +
                          `━━━━━━━━━━━━━━━━━━━━\n\n` +
                          `>  *${selectedMenu}*\n\n` +
                          `━━━━━━━━━━━━━━━━━━━━\n\n` +
                          `🥢 맛있는 식사 되세요!`;

            await this.slackClient.sendMessage(config.slack.lunchChannelId, message);

            // 메뉴 변경 버튼 추가
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.slackClient.postIndoorMenuChangeButton(config.slack.lunchChannelId);

            logger.info('Indoor menu recommendation with change button sent');
            return {
              success: true,
              timestamp: new Date().toISOString(),
              indoorMenu: selectedMenu,
              reason: weatherCheck.reason,
              skippedCafeteria: true
            };
          }
        }
      }

      // 날씨가 괜찮으면 기존 로직 실행 (구내식당 메뉴판 + 버튼)
      // 날씨 정보는 위에서 이미 가져왔으므로 재사용

      // 1. 카카오톡 "오늘의 식단" 게시글에서 메뉴 정보 가져오기
      logger.info('Fetching today menu from KakaoTalk Plus Friend...');
      const menuData = await this.kakaoScraper.getTodayMenu(config.kakao.plusFriendUrl);

      if (!menuData || !menuData.images || menuData.images.length === 0) {
        throw new Error('Failed to get menu data');
      }

      logger.info(`Menu data fetched: ${menuData.images.length} images`);

      // 2. 점심메뉴 메시지 준비
      const today = new Date();
      const dayOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][today.getDay()];
      const todayDate = today.toLocaleDateString('ko-KR');

      // 기온 정보 문자열 생성
      const temperatureInfo = currentTemperature !== null
        ? `🌡️ 현재 기온: ${currentTemperature}°C (${weatherDescription})\n`
        : '';

      // 메뉴 텍스트가 있으면 포함, 없으면 기본 메시지
      let message = `🍽️ *오늘의 점심메뉴입니다!*\n\n` +
                    `📅 ${todayDate} (${dayOfWeek})\n` +
                    `${temperatureInfo}` +
                    `⏰ 업데이트: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n\n`;

      if (menuData.menuText && menuData.menuText.length > 0) {
        message += `📋 *메뉴:*\n${menuData.menuText}\n\n`;
      }

      message += `🍚 맛있는 식사 되세요! 🥢`;

      // 3. Slack에 점심메뉴 이미지들 업로드 (메뉴판 먼저, 식판 나중)
      logger.info('Uploading lunch menu images to Slack...');

      // 이미지 순서 재정렬: 두 번째(메뉴판)를 먼저, 첫 번째(식판)를 나중에
      const reorderedImages = menuData.images.length >= 2
        ? [menuData.images[1], menuData.images[0], ...menuData.images.slice(2)]
        : menuData.images;

      logger.info(`Uploading ${reorderedImages.length} images in order: menu first, food tray second`);

      // 모든 이미지를 버튼 없이 먼저 업로드
      for (let i = 0; i < reorderedImages.length; i++) {
        try {
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
          }

          const imageLabel = i === 0 ? '📋 메뉴판' : i === 1 ? '🍽️ 식판' : `📸 추가 사진 ${i + 1}`;

          await this.slackClient.uploadAndPostImage(
            config.slack.lunchChannelId,
            reorderedImages[i].buffer,
            `lunch_menu_${new Date().toISOString().split('T')[0]}_${i + 1}.jpg`,
            i === 0 ? message : imageLabel,
            menuData.postUrl || config.kakao.plusFriendUrl,
            i === 0  // 첫 번째 이미지에만 참조 URL 포함
          );

          logger.info(`Image ${i + 1} (${imageLabel}) uploaded successfully`);
        } catch (error) {
          logger.warn(`Failed to upload image ${i + 1}:`, error.message);
        }
      }

      // 모든 이미지 업로드 후 버튼 전송
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기

      logger.info('Posting action buttons...');
      const buttonResult = await this.slackClient.postActionButtons(
        config.slack.lunchChannelId
      );

      if (!buttonResult.success) {
        logger.warn('Failed to post action buttons, but images were uploaded successfully');
      }

      logger.info('Menu sync completed successfully');
      return {
        success: true,
        timestamp: new Date().toISOString(),
        imageCount: menuData.images.length,
        buttonsPosted: buttonResult.success
      };

    } catch (error) {
      logger.error('Menu sync failed:', error);

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
    await this.interactionServer.stop();

    // ngrok 터널 종료
    if (this.tunnel) {
      await this.tunnel.close();
      logger.info('ngrok tunnel closed');
    }

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