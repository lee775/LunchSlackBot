const OCRService = require('./src/services/ocrService');
const SlackClient = require('./src/services/slackClient');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const sharp = require('sharp');

async function createTextImage() {
  // Sharp를 사용해서 텍스트가 있는 이미지 생성
  const width = 400;
  const height = 200;
  const text = '카카오톡 플러스친구\n프로필 업데이트\nKakaoTalk Profile\nTest OCR 2025';
  
  const svg = `
    <svg width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="white"/>
      <text x="20" y="40" font-family="Arial" font-size="16" fill="black">카카오톡 플러스친구</text>
      <text x="20" y="70" font-family="Arial" font-size="16" fill="black">프로필 업데이트</text>
      <text x="20" y="100" font-family="Arial" font-size="16" fill="black">KakaoTalk Profile</text>
      <text x="20" y="130" font-family="Arial" font-size="16" fill="black">Test OCR 2025</text>
    </svg>
  `;
  
  return await sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

async function testOCRSimple() {
  try {
    const ocrService = new OCRService();
    const slackClient = new SlackClient(config.slack.botToken);
    
    // 텍스트 이미지 생성
    logger.info('Creating test image with text...');
    const imageBuffer = await createTextImage();
    
    // OCR 테스트
    logger.info('Starting OCR test...');
    const ocrResult = await ocrService.extractText(imageBuffer);
    
    logger.info('OCR Result:', JSON.stringify(ocrResult, null, 2));
    
    let message = '';
    if (ocrResult.success && ocrResult.text.length > 0) {
      message = `🧪 *OCR 기능 테스트 성공*\n\n📝 **추출된 텍스트:**\n\`\`\`\n${ocrResult.text}\n\`\`\`\n\n🎯 신뢰도: ${ocrResult.confidence}%\n📊 단어 수: ${ocrResult.wordCount}개\n\n✅ OCR 기능이 정상적으로 작동합니다!`;
    } else {
      message = `🧪 *OCR 기능 테스트*\n\n⚠️ 텍스트를 추출할 수 없었습니다.\n오류: ${ocrResult.error || 'Unknown error'}`;
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

testOCRSimple();