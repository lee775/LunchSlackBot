const SlackClient = require('./src/services/slackClient');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const axios = require('axios');

async function testWithSampleImage() {
  try {
    const slackClient = new SlackClient(config.slack.botToken);
    
    // 샘플 이미지 다운로드 (무료 이미지 서비스 사용)
    logger.info('Downloading sample image...');
    const imageResponse = await axios.get('https://picsum.photos/200/200', {
      responseType: 'arraybuffer'
    });
    
    const imageBuffer = Buffer.from(imageResponse.data);
    
    logger.info('Uploading sample image to Slack...');
    const uploadResult = await slackClient.uploadAndPostImage(
      config.slack.channelId,
      imageBuffer,
      'test_profile.jpg',
      '🧪 **테스트 이미지 업로드**\n\n이것은 카카오-슬랙 봇의 이미지 업로드 기능 테스트입니다.\n실제 카카오톡 프로필 이미지 대신 샘플 이미지를 사용했습니다.'
    );
    
    if (uploadResult.success) {
      logger.info('Sample image uploaded successfully!');
      logger.info(`File ID: ${uploadResult.fileId}`);
      logger.info(`Permalink: ${uploadResult.permalink}`);
    }
    
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

testWithSampleImage();