const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class UsageTracker {
  constructor(dataFilePath = null) {
    this.dataFilePath = dataFilePath || path.join(__dirname, '../../data/usage.json');
    this.usageData = {};
    this.ensureDataDirectory();
    this.loadData();
  }

  ensureDataDirectory() {
    const dataDir = path.dirname(this.dataFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      logger.info(`Created data directory: ${dataDir}`);
    }
  }

  loadData() {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = fs.readFileSync(this.dataFilePath, 'utf8');
        this.usageData = JSON.parse(data);
        logger.info(`Loaded usage data from ${this.dataFilePath}`);

        // Clean up old data (older than 7 days)
        this.cleanupOldData();
      } else {
        this.usageData = {};
        logger.info('No existing usage data found, starting fresh');
      }
    } catch (error) {
      logger.error('Error loading usage data:', error);
      this.usageData = {};
    }
  }

  saveData() {
    try {
      fs.writeFileSync(
        this.dataFilePath,
        JSON.stringify(this.usageData, null, 2),
        'utf8'
      );
      logger.debug(`Saved usage data to ${this.dataFilePath}`);
    } catch (error) {
      logger.error('Error saving usage data:', error);
    }
  }

  cleanupOldData() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

    let cleanedCount = 0;
    for (const date in this.usageData) {
      if (date < cutoffDate) {
        delete this.usageData[date];
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old usage records`);
      this.saveData();
    }
  }

  /**
   * Check if anyone has used the feature today
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {boolean} - true if no one used it yet, false if already used
   */
  canUseToday(date) {
    // 오늘 날짜에 사용 기록이 없으면 사용 가능
    return !this.usageData[date];
  }

  /**
   * Record that someone used the feature today
   * @param {string} userId - Slack user ID (for logging)
   * @param {string} date - Date in YYYY-MM-DD format
   */
  recordUsage(userId, date) {
    if (!this.usageData[date]) {
      this.usageData[date] = {
        userId: userId,
        timestamp: new Date().toISOString(),
        previewMenu: null,
        confirmed: false
      };
      this.saveData();
      logger.info(`Recorded usage for user ${userId} on ${date} (first user of the day)`);
    }
  }

  /**
   * Set the preview menu for today
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} menu - Menu name
   */
  setPreviewMenu(date, menu) {
    if (!this.usageData[date]) {
      this.usageData[date] = {
        userId: null,
        timestamp: new Date().toISOString(),
        previewMenu: menu,
        confirmed: false
      };
    } else {
      this.usageData[date].previewMenu = menu;
    }
    this.saveData();
    logger.info(`Set preview menu for ${date}: ${menu}`);
  }

  /**
   * Get the preview menu for today (returns existing or generates new one)
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {function} menuGenerator - Optional function to generate menu if not exists
   * @returns {string|null} - Menu name or null
   */
  getPreviewMenu(date, menuGenerator = null) {
    // If preview menu already exists, return it
    if (this.usageData[date]?.previewMenu) {
      return this.usageData[date].previewMenu;
    }

    // If menu generator provided and no menu exists, generate and save
    if (menuGenerator && typeof menuGenerator === 'function') {
      const newMenu = menuGenerator();
      this.setPreviewMenu(date, newMenu);
      logger.info(`Generated new preview menu for ${date}: ${newMenu}`);
      return newMenu;
    }

    return null;
  }

  /**
   * Set the preview menu with weather info for today
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} menu - Menu name
   * @param {object} weatherInfo - Weather information
   */
  setPreviewMenuWithWeather(date, menu, weatherInfo) {
    if (!this.usageData[date]) {
      this.usageData[date] = {
        userId: null,
        timestamp: new Date().toISOString(),
        previewMenu: menu,
        weatherInfo: weatherInfo,
        confirmed: false
      };
    } else {
      this.usageData[date].previewMenu = menu;
      this.usageData[date].weatherInfo = weatherInfo;
    }
    this.saveData();
    logger.info(`Set preview menu with weather for ${date}: ${menu}${weatherInfo?.isIndoorOnly ? ' (실내 메뉴)' : ''}`);
  }

  /**
   * Get the preview menu with weather info for today
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {object|null} - { menu, weatherInfo } or null
   */
  getPreviewMenuWithWeather(date) {
    if (this.usageData[date]?.previewMenu) {
      return {
        menu: this.usageData[date].previewMenu,
        weatherInfo: this.usageData[date].weatherInfo || null
      };
    }
    return null;
  }

  /**
   * Confirm the menu for today
   * @param {string} date - Date in YYYY-MM-DD format
   */
  confirmMenu(date) {
    if (this.usageData[date]) {
      this.usageData[date].confirmed = true;
      this.saveData();
      logger.info(`Menu confirmed for ${date}`);
    }
  }

  /**
   * Check if menu is confirmed for today
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {boolean} - true if confirmed
   */
  isMenuConfirmed(date) {
    return this.usageData[date]?.confirmed || false;
  }

  /**
   * Get who used the feature today
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {object|null} - User info or null
   */
  getUsageToday(date) {
    return this.usageData[date] || null;
  }

  /**
   * Get usage statistics
   * @returns {object} - Usage statistics
   */
  getStats() {
    const stats = {
      totalDays: Object.keys(this.usageData).length,
      usageByDate: {}
    };

    for (const date in this.usageData) {
      stats.usageByDate[date] = {
        userId: this.usageData[date].userId,
        timestamp: this.usageData[date].timestamp
      };
    }

    return stats;
  }

  /**
   * Clear today's usage data (keeps preview menu and weather info)
   * @param {string} date - Date in YYYY-MM-DD format
   */
  clearToday(date) {
    if (this.usageData[date]) {
      // Keep preview menu and weather info, only reset confirmation status
      const previewMenu = this.usageData[date].previewMenu;
      const weatherInfo = this.usageData[date].weatherInfo;
      this.usageData[date] = {
        userId: null,
        timestamp: new Date().toISOString(),
        previewMenu: previewMenu,
        weatherInfo: weatherInfo,
        confirmed: false
      };
      this.saveData();
      logger.info(`Cleared usage data for ${date}, kept preview menu: ${previewMenu}${weatherInfo?.isIndoorOnly ? ' (실내 메뉴)' : ''}`);
      return true;
    }
    return false;
  }

  /**
   * Clear all usage data
   */
  clearAll() {
    this.usageData = {};
    this.saveData();
    logger.info('Cleared all usage data');
  }
}

module.exports = UsageTracker;
