const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class KakaoScraper {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
      logger.info('Puppeteer browser initialized');
    } catch (error) {
      logger.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async getTodayMenu(plusFriendUrl) {
    let page;
    try {
      if (!this.browser) {
        await this.initialize();
      }

      page = await this.browser.newPage();

      // 페이지 설정
      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // 자동화 감지 방지
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        delete navigator.__proto__.webdriver;
      });

      logger.info(`Navigating to: ${plusFriendUrl}`);

      // 1단계: 메인 페이지 로드
      await page.goto(plusFriendUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 5000)); // 대기 시간 증가

      logger.info('Main page loaded, searching for "오늘의 식단" post...');

      // 2단계: "오늘의 식단" 게시글 링크 찾고 클릭
      const clicked = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a.link_board'));
        const todayMenuLink = links.find(link => {
          const title = link.querySelector('.tit_info');
          return title && title.textContent.includes('오늘의 식단');
        });

        if (todayMenuLink) {
          todayMenuLink.click();
          return true;
        }
        return false;
      });

      if (!clicked) {
        throw new Error('Could not find or click "오늘의 식단" post link');
      }

      logger.info('Clicked on "오늘의 식단" post, waiting for navigation...');

      // 페이지 이동 대기 (새 탭이나 팝업이 열릴 수 있음)
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);

      // 현재 URL 확인
      const currentUrl = page.url();
      logger.info(`Current URL after click: ${currentUrl}`);

      logger.info('Post page loaded, extracting menu text and images...');

      // 4단계: 메뉴 텍스트와 이미지 추출
      const menuData = await page.evaluate(() => {
        // 텍스트 추출 (게시글 본문만 정확하게)
        const textSelectors = [
          '.desc_g',           // 게시글 본문
          '.txt_desc',         // 설명 텍스트
          '.feed_desc'         // 피드 설명
        ];

        let menuText = '';
        for (const selector of textSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            const text = element.textContent.trim();
            // 의미 있는 메뉴 텍스트인지 확인 (최소 5자 이상, "채널홈" 같은 불필요한 텍스트 제외)
            if (text.length >= 5 &&
                !text.includes('채널홈을 폰으로') &&
                !text.includes('접속해보세요') &&
                !text.includes('QR 코드')) {
              menuText = text;
              break;
            }
          }
        }

        // 이미지 추출 (식판 사진)
        const images = Array.from(document.querySelectorAll('img'));
        const validImages = images
          .filter(img =>
            img.src &&
            !img.src.includes('data:image') &&
            !img.src.includes('blank.gif') &&
            !img.src.includes('qrcode') &&
            !img.alt.includes('프로필') &&
            (img.naturalWidth || img.width) > 100 &&
            (img.naturalHeight || img.height) > 100
          )
          .map(img => ({
            src: img.src,
            alt: img.alt || '',
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height
          }))
          .sort((a, b) => (b.width * b.height) - (a.width * a.height));

        return {
          menuText: menuText,
          images: validImages
        };
      });

      logger.info(`Menu text extracted: ${menuData.menuText.substring(0, 100)}...`);
      logger.info(`Found ${menuData.images.length} food images`);

      // 5단계: 이미지 다운로드
      const images = [];
      for (let i = 0; i < Math.min(menuData.images.length, 3); i++) {
        const img = menuData.images[i];
        try {
          logger.info(`Downloading image ${i + 1}: ${img.src} (${img.width}x${img.height})`);

          const imageResponse = await page.goto(img.src);
          if (imageResponse && imageResponse.ok()) {
            const buffer = await imageResponse.buffer();
            images.push({
              buffer: buffer,
              url: img.src,
              width: img.width,
              height: img.height,
              alt: img.alt
            });
            logger.info(`Image ${i + 1} downloaded successfully`);
          }
        } catch (error) {
          logger.warn(`Failed to download image ${i + 1}:`, error.message);
        }
      }

      if (images.length === 0) {
        throw new Error('No food images could be downloaded');
      }

      return {
        menuText: menuData.menuText,
        images: images,
        timestamp: new Date().toISOString(),
        postUrl: currentUrl
      };

    } catch (error) {
      logger.error('Error getting today menu:', error);
      throw error;
    } finally {
      if (page) await page.close();
    }
  }

  async getProfileImage(plusFriendUrl) {
    let page;
    try {
      if (!this.browser) {
        await this.initialize();
      }

      page = await this.browser.newPage();

      // 페이지 설정
      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // 자동화 감지 방지
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        delete navigator.__proto__.webdriver;
      });

      logger.info(`Navigating to: ${plusFriendUrl}`);
      
      // 페이지 로드
      const response = await page.goto(plusFriendUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      if (!response || !response.ok()) {
        throw new Error(`Failed to load page: ${response ? response.status() : 'No response'}`);
      }

      // 페이지가 완전히 로드될 때까지 대기
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      logger.info('Page loaded successfully, searching for profile images...');

      // 페이지의 모든 이미지를 찾아서 크기와 프로필 관련성으로 정렬
      logger.info('Searching for the largest profile image...');
      
      const allImages = await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        return images.map(img => ({
          src: img.src,
          alt: img.alt || '',
          className: img.className || '',
          width: img.naturalWidth || img.width || img.offsetWidth,
          height: img.naturalHeight || img.height || img.offsetHeight,
          id: img.id || '',
          parentClassName: img.parentElement ? img.parentElement.className : '',
          isProfileRelated: (
            img.alt.includes('프로필') || 
            img.src.includes('kakaocdn.net') ||
            img.src.includes('profile') ||
            img.alt.includes('profile')
          )
        })).filter(img => 
          img.src && 
          !img.src.includes('data:image') &&
          !img.src.includes('blank.gif') &&
          img.width > 50 && img.height > 50
        ).sort((a, b) => {
          // 프로필 관련 이미지 우선, 그 다음 크기 순
          if (a.isProfileRelated && !b.isProfileRelated) return -1;
          if (!a.isProfileRelated && b.isProfileRelated) return 1;
          return (b.width * b.height) - (a.width * a.height);
        });
      });

      logger.info(`Found ${allImages.length} potential images:`);
      allImages.slice(0, 3).forEach((img, i) => {
        logger.info(`${i + 1}. ${img.src} (${img.width}x${img.height}) - ${img.alt} ${img.isProfileRelated ? '[PROFILE]' : ''}`);
      });

      let profileImageUrl = null;
      let profileImageBuffer = null;

      // 가장 적합한 이미지 선택 (프로필 관련이면서 가장 큰 것)
      if (allImages.length > 0) {
        profileImageUrl = allImages[0].src;
        logger.info(`Selected image: ${profileImageUrl} (${allImages[0].width}x${allImages[0].height})`);
      }

      // 이미지 URL을 찾았으면 다운로드 시도, 못 찾으면 스크린샷 캡처
      if (profileImageUrl) {
        try {
          // 이미지 다운로드 시도
          const imageResponse = await page.goto(profileImageUrl);
          if (imageResponse && imageResponse.ok()) {
            profileImageBuffer = await imageResponse.buffer();
            logger.info('Profile image downloaded successfully');
            
            return {
              url: profileImageUrl,
              buffer: profileImageBuffer,
              timestamp: new Date().toISOString(),
              method: 'download'
            };
          }
        } catch (downloadError) {
          logger.warn('Image download failed, trying screenshot method:', downloadError.message);
        }
      }

      // 다운로드 실패하거나 이미지를 못 찾은 경우 스크린샷 캡처
      logger.info('Attempting to capture screenshot of profile area...');
      
      // 페이지 전체 스크린샷
      const fullScreenshot = await page.screenshot({
        type: 'png',
        fullPage: true
      });

      // 프로필 영역만 캡처 시도
      let profileScreenshot = fullScreenshot;
      
      try {
        // 프로필 영역으로 추정되는 요소들 찾기
        const profileSelectors = [
          '.profile_info', '.profile-info', '.profile_area', 
          '.user_info', '.user-info', '.thumb_area',
          '.profile', '.avatar', '.user-avatar'
        ];

        let profileElement = null;
        for (const selector of profileSelectors) {
          try {
            profileElement = await page.$(selector);
            if (profileElement) {
              logger.info(`Found profile area with selector: ${selector}`);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        // 프로필 영역을 찾았으면 해당 영역만 스크린샷
        if (profileElement) {
          profileScreenshot = await profileElement.screenshot({
            type: 'png'
          });
          logger.info('Profile area screenshot captured');
        } else {
          // 페이지 상단 영역만 캡처 (일반적으로 프로필이 위쪽에 있음)
          profileScreenshot = await page.screenshot({
            type: 'png',
            clip: { x: 0, y: 0, width: 800, height: 600 }
          });
          logger.info('Top area screenshot captured as fallback');
        }

      } catch (screenshotError) {
        logger.warn('Profile area screenshot failed, using full page:', screenshotError.message);
      }

      return {
        url: 'screenshot_capture',
        buffer: profileScreenshot,
        timestamp: new Date().toISOString(),
        method: 'screenshot'
      };

    } catch (error) {
      logger.error('Error scraping profile image:', error);
      throw error;
    } finally {
      if (page) await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }
}

module.exports = KakaoScraper;