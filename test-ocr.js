const OCRService = require('./src/services/ocrService');
const SlackClient = require('./src/services/slackClient');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const axios = require('axios');

async function testOCR() {
  try {
    const ocrService = new OCRService();
    const slackClient = new SlackClient(config.slack.botToken);
    
    // 텍스트가 있는 샘플 이미지 다운로드
    logger.info('Downloading sample image with text...');
    const imageResponse = await axios.get('https://via.placeholder.com/400x200/000000/FFFFFF?text=Hello+KakaoTalk+Profile+Test+안녕하세요+카카오톡', {
      responseType: 'arraybuffer'
    });
    
    const imageBuffer = Buffer.from(imageResponse.data);
    
    // OCR 테스트
    logger.info('Starting OCR test...');
    const ocrResult = await ocrService.extractText(imageBuffer);
    
    logger.info('OCR Result:', ocrResult);
    
    let message = '';
    if (ocrResult.success && ocrResult.text.length > 0) {
      message = `🧪 *OCR 테스트 성공*\n\n📝 **추출된 텍스트:**\n\`\`\`\n${ocrResult.text}\n\`\`\`\n\n🎯 신뢰도: ${ocrResult.confidence}%\n📊 단어 수: ${ocrResult.wordCount}개`;
    } else {
      message = `🧪 *OCR 테스트*\n\n⚠️ 텍스트를 추출할 수 없었습니다.`;
    }
    
    // Slack으로 결과 전송
    const uploadResult = await slackClient.uploadAndPostImage(
      config.slack.channelId,
      imageBuffer,
      'ocr_test.png',
      message
    );
    
    if (uploadResult.success) {
      logger.info('OCR test completed and sent to Slack successfully!');
    }
    
    await ocrService.close();
    
  } catch (error) {
    logger.error('OCR test failed:', error);
  }
}

testOCR();