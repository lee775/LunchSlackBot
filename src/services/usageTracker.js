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
        timestamp: new Date().toISOString()
      };
      this.saveData();
      logger.info(`Recorded usage for user ${userId} on ${date} (first user of the day)`);
    }
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
   * Clear today's usage data
   * @param {string} date - Date in YYYY-MM-DD format
   */
  clearToday(date) {
    if (this.usageData[date]) {
      delete this.usageData[date];
      this.saveData();
      logger.info(`Cleared usage data for ${date}`);
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
