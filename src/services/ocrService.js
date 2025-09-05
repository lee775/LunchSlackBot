const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const logger = require('../utils/logger');

class OCRService {
  constructor() {
    this.worker = null;
  }

  async initialize() {
    try {
      logger.info('Initializing OCR service...');
      this.worker = await Tesseract.createWorker('kor+eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            logger.debug(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      logger.info('OCR service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OCR service:', error);
      throw error;
    }
  }

  async preprocessImage(imageBuffer) {
    try {
      logger.info('Preprocessing image for OCR...');
      
      // Sharp를 사용해서 이미지 전처리
      const processedImage = await sharp(imageBuffer)
        .greyscale() // 흑백 변환
        .normalize() // 대비 정규화
        .sharpen() // 선명하게
        .resize({ width: 800, height: 800, fit: 'inside' }) // 적절한 크기로 조정
        .png() // PNG 형식으로 변환
        .toBuffer();

      logger.info('Image preprocessing completed');
      return processedImage;
    } catch (error) {
      logger.error('Image preprocessing failed:', error);
      return imageBuffer; // 전처리 실패 시 원본 반환
    }
  }

  async extractText(imageBuffer, options = {}) {
    try {
      if (!this.worker) {
        await this.initialize();
      }

      // 이미지 전처리
      const processedImage = await this.preprocessImage(imageBuffer);

      logger.info('Starting OCR text extraction...');
      const { data: { text, confidence } } = await this.worker.recognize(processedImage, {
        tessedit_char_whitelist: options.whitelist || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz가-힣ㄱ-ㅎㅏ-ㅣ.,!?()[]{}:;"\'-_/@#$%^&*+=<>~`| \n\t',
        tessedit_pageseg_mode: options.pageSegMode || Tesseract.PSM.AUTO
      });

      const cleanedText = this.cleanText(text);
      
      logger.info(`OCR completed. Confidence: ${confidence}%`);
      logger.info(`Extracted text length: ${cleanedText.length} characters`);
      
      if (cleanedText.trim().length === 0) {
        logger.warn('No text found in image');
        return {
          success: false,
          text: '',
          confidence: 0,
          message: 'No readable text found in the image'
        };
      }

      return {
        success: true,
        text: cleanedText,
        confidence: Math.round(confidence),
        wordCount: cleanedText.split(/\s+/).filter(word => word.length > 0).length
      };

    } catch (error) {
      logger.error('OCR text extraction failed:', error);
      return {
        success: false,
        text: '',
        confidence: 0,
        error: error.message
      };
    }
  }

  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ') // 여러 공백을 하나로
      .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ.,!?()[\]{}:;"\'-_/@#$%^&*+=<>~`]/g, '') // 특수문자 정리
      .trim(); // 앞뒤 공백 제거
  }

  async extractTextFromMultipleImages(imageBuffers) {
    try {
      const results = [];
      
      for (let i = 0; i < imageBuffers.length; i++) {
        logger.info(`Processing image ${i + 1}/${imageBuffers.length}`);
        const result = await this.extractText(imageBuffers[i]);
        results.push({
          imageIndex: i,
          ...result
        });
      }

      // 가장 신뢰도가 높은 결과 선택
      const bestResult = results.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );

      return {
        bestResult,
        allResults: results,
        totalProcessed: imageBuffers.length
      };

    } catch (error) {
      logger.error('Multiple image OCR failed:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.worker) {
        await this.worker.terminate();
        logger.info('OCR service terminated');
      }
    } catch (error) {
      logger.error('Error terminating OCR service:', error);
    }
  }
}

module.exports = OCRService;