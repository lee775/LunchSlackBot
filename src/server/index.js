const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');

class SlackInteractionServer {
  constructor(slackClient, usageTracker) {
    this.app = express();
    this.slackClient = slackClient;
    this.usageTracker = usageTracker;
    this.port = config.server.port || 3000;
    this.server = null;

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Body parser for JSON
    this.app.use(bodyParser.json());

    // Body parser for URL encoded data (Slack sends data as URL encoded)
    this.app.use(bodyParser.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Slack Interactive Components endpoint
    this.app.post('/slack/interactions', async (req, res) => {
      try {
        // Slack sends payload as URL encoded 'payload' parameter
        const payload = JSON.parse(req.body.payload);

        logger.info('Received Slack interaction:', {
          type: payload.type,
          user: payload.user?.id,
          action: payload.actions?.[0]?.action_id
        });

        // Acknowledge the request immediately (within 3 seconds)
        res.status(200).send();

        // Process the interaction asynchronously
        await this.handleInteraction(payload);

      } catch (error) {
        logger.error('Error handling Slack interaction:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Fallback route
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  async handleInteraction(payload) {
    try {
      const { type, user, actions, response_url, channel } = payload;

      if (type === 'block_actions' && actions && actions.length > 0) {
        const action = actions[0];

        // Handle "change menu" button click
        if (action.action_id === 'change_lunch_menu') {
          await this.handleChangeMenuAction(user, response_url, channel);
        }

        // Handle "reset usage" button click (admin only)
        if (action.action_id === 'reset_menu_usage') {
          await this.handleResetUsageAction(user, response_url, channel);
        }
      }
    } catch (error) {
      logger.error('Error processing interaction:', error);
    }
  }

  async handleChangeMenuAction(user, responseUrl, channel) {
    try {
      const userId = user.id;
      const userName = user.name || user.id;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Check if anyone already used this feature today
      const canUse = this.usageTracker.canUseToday(today);

      if (!canUse) {
        // Someone already used the feature today - no response
        const usageInfo = this.usageTracker.getUsageToday(today);
        logger.info(`User ${userId} tried to change menu but already used by ${usageInfo.userId} today`);

        // Send ephemeral message to inform the user
        await this.sendEphemeralResponse(responseUrl, {
          text: '⏰ *오늘은 이미 메뉴가 변경되었습니다!*',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '⏰ *오늘은 이미 메뉴가 변경되었습니다!*\n\n메뉴 변경은 하루에 한 번만 가능합니다.\n내일 다시 시도해주세요! 😊'
              }
            }
          ],
          replace_original: false,
          response_type: 'ephemeral'
        });

        return;
      }

      // Record usage - this user is the first today
      this.usageTracker.recordUsage(userId, today);

      // Get random menu
      const randomMenu = this.getRandomMenu();

      // Send new menu as public message to channel
      const axios = require('axios');
      await axios.post(responseUrl, {
        text: `🎲 *오늘의 대체 메뉴가 선택되었습니다!*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎲 *오늘의 대체 메뉴가 선택되었습니다!*\n\n🍽️ **${randomMenu}**\n\n맛있는 식사 되세요! 😋`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `💡 ${new Date().toLocaleDateString('ko-KR')} | 오늘의 메뉴 변경 완료`
              }
            ]
          }
        ],
        replace_original: false,
        response_type: 'in_channel' // 채널 전체에 공개
      });

      logger.info(`Menu changed by user ${userId} (${userName}): ${randomMenu}`);

    } catch (error) {
      logger.error('Error handling change menu action:', error);

      // Send error message
      await this.sendEphemeralResponse(responseUrl, {
        text: '❌ 메뉴 변경 중 오류가 발생했습니다. 다시 시도해주세요.',
        response_type: 'ephemeral'
      });
    }
  }

  async handleResetUsageAction(user, responseUrl, channel) {
    try {
      const userId = user.id;
      const userName = user.name || user.id;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Clear today's usage
      const wasCleared = this.usageTracker.clearToday(today);

      // Send confirmation message
      const axios = require('axios');
      if (wasCleared) {
        await axios.post(responseUrl, {
          text: '✅ *메뉴 변경 카운트가 초기화되었습니다!*',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *메뉴 변경 카운트가 초기화되었습니다!*\n\n오늘의 메뉴 변경 사용 기록이 초기화되었습니다.\n다시 메뉴 변경이 가능합니다! 🎲`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `💡 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | 초기화 완료`
                }
              ]
            }
          ],
          replace_original: false,
          response_type: 'in_channel'
        });

        logger.info(`Usage reset by admin user ${userId} (${userName}) for date ${today}`);
      } else {
        await axios.post(responseUrl, {
          text: 'ℹ️ 오늘 초기화할 데이터가 없습니다.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'ℹ️ *초기화할 데이터가 없습니다.*\n\n오늘은 아직 메뉴 변경이 사용되지 않았습니다.'
              }
            }
          ],
          replace_original: false,
          response_type: 'ephemeral'
        });

        logger.info(`User ${userId} (${userName}) tried to reset but no data for ${today}`);
      }

    } catch (error) {
      logger.error('Error handling reset usage action:', error);

      // Send error message
      await this.sendEphemeralResponse(responseUrl, {
        text: '❌ 초기화 중 오류가 발생했습니다. 다시 시도해주세요.',
        response_type: 'ephemeral'
      });
    }
  }

  async sendEphemeralResponse(responseUrl, message) {
    try {
      const axios = require('axios');
      await axios.post(responseUrl, message);
    } catch (error) {
      logger.error('Error sending response to Slack:', error);
      throw error;
    }
  }

  getRandomMenu() {
    const menus = config.lunch.alternativeMenus;
    const randomIndex = Math.floor(Math.random() * menus.length);
    return menus[randomIndex];
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          logger.info(`Slack interaction server started on port ${this.port}`);
          logger.info(`Interactive Components URL: http://localhost:${this.port}/slack/interactions`);
          resolve();
        });

        this.server.on('error', (error) => {
          logger.error('Server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Slack interaction server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = SlackInteractionServer;
