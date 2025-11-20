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

        // Handle "preview menu" button click
        if (action.action_id === 'preview_lunch_menu') {
          await this.handlePreviewMenuAction(user, response_url, channel);
        }

        // Handle "change menu" button click
        if (action.action_id === 'change_lunch_menu') {
          await this.handleChangeMenuAction(user, response_url, channel);
        }

        // Handle "confirm menu" button click
        if (action.action_id === 'confirm_lunch_menu') {
          await this.handleConfirmMenuAction(user, response_url, channel);
        }

        // Handle "cancel menu" button click
        if (action.action_id === 'cancel_lunch_menu') {
          await this.handleCancelMenuAction(user, response_url, channel);
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

  async handlePreviewMenuAction(user, responseUrl, channel) {
    try {
      const userId = user.id;
      const userName = user.name || user.id;
      const today = new Date().toISOString().split('T')[0];

      // Check if already confirmed
      const isConfirmed = this.usageTracker.isMenuConfirmed(today);

      if (isConfirmed) {
        // Already confirmed - show rejection message
        await this.sendEphemeralResponse(responseUrl, {
          text: '⏰ *오늘은 이미 메뉴가 확정되었습니다!*',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '⏰ *오늘은 이미 메뉴가 확정되었습니다!*\n\n메뉴 변경은 하루에 한 번만 가능합니다.\n내일 다시 시도해주세요! 😊'
              }
            }
          ],
          replace_original: false,
          response_type: 'ephemeral'
        });
        return;
      }

      // Get or generate today's preview menu (same for all users)
      const previewMenu = this.usageTracker.getPreviewMenu(today, () => this.getRandomMenu());

      // Send preview as ephemeral message (only visible to the user)
      await this.sendEphemeralResponse(responseUrl, {
        text: `👀 오늘의 대체 메뉴 미리보기: ${previewMenu}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `👀 *오늘의 대체 메뉴 미리보기*\n\n🍽️ **${previewMenu}**\n\n이 메뉴는 오늘 하루 동안 모든 사람에게 동일하게 보입니다.\n마음에 들면 "확정" 버튼을, 구내식당을 먹고 싶으면 "취소" 버튼을 눌러주세요!`
            }
          },
          {
            type: 'actions',
            block_id: 'preview_actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✅ 이 메뉴로 확정',
                  emoji: true
                },
                style: 'primary',
                action_id: 'confirm_lunch_menu'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '❌ 구내식당으로 먹을래요',
                  emoji: true
                },
                style: 'danger',
                action_id: 'cancel_lunch_menu'
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '💡 확정하면 모든 사람에게 공개되고, 취소하면 다른 사람이 버튼을 누를 수 있습니다.'
              }
            ]
          }
        ],
        replace_original: false,
        response_type: 'ephemeral'
      });

      logger.info(`Menu preview shown to user ${userId} (${userName}): ${previewMenu}`);

    } catch (error) {
      logger.error('Error handling preview menu action:', error);

      await this.sendEphemeralResponse(responseUrl, {
        text: '❌ 메뉴 미리보기 중 오류가 발생했습니다. 다시 시도해주세요.',
        response_type: 'ephemeral'
      });
    }
  }

  async handleConfirmMenuAction(user, responseUrl, channel) {
    try {
      const userId = user.id;
      const userName = user.name || user.id;
      const today = new Date().toISOString().split('T')[0];

      const previewMenu = this.usageTracker.getPreviewMenu(today);

      if (!previewMenu) {
        await this.sendEphemeralResponse(responseUrl, {
          text: '❌ 확정할 메뉴가 없습니다. 먼저 미리보기를 눌러주세요!',
          response_type: 'ephemeral'
        });
        return;
      }

      // Confirm the menu
      this.usageTracker.confirmMenu(today);

      // Send public message to channel
      const axios = require('axios');
      await axios.post(responseUrl, {
        text: `🎲 *오늘의 대체 메뉴가 확정되었습니다!*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎲 *오늘의 대체 메뉴가 확정되었습니다!*\n\n🍽️ **${previewMenu}**\n\n맛있는 식사 되세요! 😋`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `💡 ${new Date().toLocaleDateString('ko-KR')} | 메뉴 확정 완료`
              }
            ]
          }
        ],
        replace_original: false,
        response_type: 'in_channel'
      });

      logger.info(`Menu confirmed by user ${userId} (${userName}): ${previewMenu}`);

    } catch (error) {
      logger.error('Error handling confirm menu action:', error);

      await this.sendEphemeralResponse(responseUrl, {
        text: '❌ 메뉴 확정 중 오류가 발생했습니다. 다시 시도해주세요.',
        response_type: 'ephemeral'
      });
    }
  }

  async handleCancelMenuAction(user, responseUrl, channel) {
    try {
      const userId = user.id;
      const userName = user.name || user.id;
      const today = new Date().toISOString().split('T')[0];

      // Clear today's usage
      const wasCleared = this.usageTracker.clearToday(today);

      if (wasCleared) {
        await this.sendEphemeralResponse(responseUrl, {
          text: '✅ 취소되었습니다!',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '✅ *메뉴 선택이 취소되었습니다!*\n\n구내식당 메뉴를 즐기세요! 😊\n다른 사람이 메뉴를 변경할 수 있습니다.'
              }
            }
          ],
          replace_original: false,
          response_type: 'ephemeral'
        });

        logger.info(`Menu cancelled by user ${userId} (${userName})`);
      } else {
        await this.sendEphemeralResponse(responseUrl, {
          text: '❌ 취소할 메뉴가 없습니다.',
          response_type: 'ephemeral'
        });
      }

    } catch (error) {
      logger.error('Error handling cancel menu action:', error);

      await this.sendEphemeralResponse(responseUrl, {
        text: '❌ 메뉴 취소 중 오류가 발생했습니다. 다시 시도해주세요.',
        response_type: 'ephemeral'
      });
    }
  }

  async handleChangeMenuAction(user, responseUrl, channel) {
    try {
      const userId = user.id;
      const userName = user.name || user.id;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Check if menu is already confirmed today
      const isConfirmed = this.usageTracker.isMenuConfirmed(today);

      if (isConfirmed) {
        // Menu is confirmed - locked
        logger.info(`User ${userId} tried to change menu but already confirmed today`);

        // Send ephemeral message to inform the user
        await this.sendEphemeralResponse(responseUrl, {
          text: '⏰ *오늘은 이미 메뉴가 확정되었습니다!*',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '⏰ *오늘은 이미 메뉴가 확정되었습니다!*\n\n메뉴 확정은 하루에 한 번만 가능합니다.\n내일 다시 시도해주세요! 😊'
              }
            }
          ],
          replace_original: false,
          response_type: 'ephemeral'
        });

        return;
      }

      // Get or generate today's menu (same as preview)
      const todayMenu = this.usageTracker.getPreviewMenu(today, () => this.getRandomMenu());

      // Confirm menu
      this.usageTracker.confirmMenu(today);

      // Send public message to channel (instant confirmation)
      const axios = require('axios');
      await axios.post(responseUrl, {
        text: `🎲 *오늘의 대체 메뉴가 확정되었습니다!*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎲 *오늘의 대체 메뉴가 확정되었습니다!*\n\n🍽️ **${todayMenu}**\n\n맛있는 식사 되세요! 😋`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `💡 ${new Date().toLocaleDateString('ko-KR')} | 메뉴 확정 완료`
              }
            ]
          }
        ],
        replace_original: false,
        response_type: 'in_channel' // 채널 전체에 공개
      });

      logger.info(`Menu instantly confirmed by user ${userId} (${userName}): ${todayMenu}`);

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
