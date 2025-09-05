const SlackClient = require('./src/services/slackClient');
const config = require('./src/config');
const logger = require('./src/utils/logger');

async function testSlack() {
  try {
    const slackClient = new SlackClient(config.slack.botToken);
    
    // 간단한 텍스트 메시지 테스트
    logger.info('Testing simple message...');
    await slackClient.sendMessage(
      config.slack.channelId, 
      '🧪 테스트 메시지: 카카오-슬랙 봇이 정상적으로 작동하고 있습니다!'
    );
    
    logger.info('Test completed successfully!');
    
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

testSlack();