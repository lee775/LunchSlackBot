/**
 * 날씨 서비스 - Open-Meteo API 사용 (무료, API 키 불필요)
 * 영하 5도 이하 또는 눈이 오는 경우 감지
 */
const axios = require('axios');
const logger = require('../utils/logger');

class WeatherService {
  constructor() {
    // 서울 좌표
    this.latitude = 37.5665;
    this.longitude = 126.9780;
    this.apiUrl = 'https://api.open-meteo.com/v1/forecast';
  }

  /**
   * 현재 날씨 정보 가져오기
   * @returns {Object} { temperature, isSnowing, weatherCode, description }
   */
  async getCurrentWeather() {
    try {
      const response = await axios.get(this.apiUrl, {
        params: {
          latitude: this.latitude,
          longitude: this.longitude,
          current: 'temperature_2m,weather_code',
          timezone: 'Asia/Seoul'
        }
      });

      const current = response.data.current;
      const temperature = current.temperature_2m;
      const weatherCode = current.weather_code;

      // WMO Weather Code에서 눈 관련 코드 확인
      // 71-77: 눈, 85-86: 눈소나기
      const snowCodes = [71, 73, 75, 77, 85, 86];
      const isSnowing = snowCodes.includes(weatherCode);

      const description = this.getWeatherDescription(weatherCode);

      logger.info(`현재 날씨: ${temperature}°C, ${description} (코드: ${weatherCode})`);

      return {
        temperature,
        isSnowing,
        weatherCode,
        description
      };
    } catch (error) {
      logger.error('날씨 정보 가져오기 실패:', error.message);
      // 오류 시 기본값 반환 (날씨 체크 비활성화)
      return {
        temperature: 10,
        isSnowing: false,
        weatherCode: 0,
        description: '알 수 없음',
        error: true
      };
    }
  }

  /**
   * 실내 메뉴만 선택해야 하는 날씨인지 확인
   * @param {number} coldThreshold - 한파 기준 온도 (기본값: -5)
   * @returns {Object} { shouldStayIndoor, reason, weather }
   */
  async checkIndoorWeather(coldThreshold = -5) {
    const weather = await this.getCurrentWeather();

    if (weather.error) {
      return {
        shouldStayIndoor: false,
        reason: null,
        weather
      };
    }

    let shouldStayIndoor = false;
    let reason = null;

    if (weather.temperature <= coldThreshold) {
      shouldStayIndoor = true;
      reason = `🥶 현재 기온이 ${weather.temperature}°C로 매우 춥습니다!`;
    } else if (weather.isSnowing) {
      shouldStayIndoor = true;
      reason = `❄️ 현재 눈이 오고 있습니다! (${weather.description})`;
    }

    if (shouldStayIndoor) {
      logger.info(`실내 메뉴 추천: ${reason}`);
    }

    return {
      shouldStayIndoor,
      reason,
      weather
    };
  }

  /**
   * WMO Weather Code를 한국어 설명으로 변환
   */
  getWeatherDescription(code) {
    const descriptions = {
      0: '맑음',
      1: '대체로 맑음',
      2: '부분적으로 흐림',
      3: '흐림',
      45: '안개',
      48: '안개 (서리)',
      51: '가벼운 이슬비',
      53: '이슬비',
      55: '강한 이슬비',
      56: '얼어붙는 이슬비 (약함)',
      57: '얼어붙는 이슬비 (강함)',
      61: '가벼운 비',
      63: '비',
      65: '강한 비',
      66: '얼어붙는 비 (약함)',
      67: '얼어붙는 비 (강함)',
      71: '가벼운 눈',
      73: '눈',
      75: '강한 눈',
      77: '싸락눈',
      80: '가벼운 소나기',
      81: '소나기',
      82: '강한 소나기',
      85: '가벼운 눈소나기',
      86: '강한 눈소나기',
      95: '뇌우',
      96: '뇌우 (우박 약함)',
      99: '뇌우 (우박 강함)'
    };

    return descriptions[code] || `알 수 없음 (코드: ${code})`;
  }
}

module.exports = WeatherService;
