const { WebClient } = require('@slack/web-api');
const logger = require('../utils/logger');

class SlackClient {
  constructor(botToken) {
    this.client = new WebClient(botToken);
  }

  async uploadAndPostImage(channelId, imageBuffer, filename = 'kakao_profile.jpg', message = '', referenceUrl = '', includeReference = true) {
    try {
      // 새로운 files.uploadV2 API 사용
      const uploadResult = await this.client.files.uploadV2({
        channel_id: channelId,
        file: imageBuffer,
        filename: filename,
        title: '카카오톡 플러스친구 프로필 이미지',
        initial_comment: includeReference
          ? this.buildMessageWithReference(message || `📸 매일 업데이트되는 카카오톡 플러스친구 프로필 이미지입니다. (${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`, referenceUrl)
          : message
      });

      if (uploadResult.ok) {
        logger.info(`Image uploaded successfully to Slack channel: ${channelId}`);
        logger.info('Upload result:', JSON.stringify(uploadResult, null, 2));
        return {
          success: true,
          fileId: uploadResult.file?.id || 'unknown',
          permalink: uploadResult.file?.permalink || uploadResult.files?.[0]?.permalink || 'unknown'
        };
      } else {
        throw new Error(`Slack upload failed: ${uploadResult.error}`);
      }

    } catch (error) {
      logger.error('Error uploading image to Slack:', error);
      throw error;
    }
  }

  async uploadAndPostImageWithButton(channelId, imageBuffer, filename = 'kakao_profile.jpg', message = '', referenceUrl = '') {
    try {
      // 1. Upload image with message
      const uploadResult = await this.client.files.uploadV2({
        channel_id: channelId,
        file: imageBuffer,
        filename: filename,
        title: '카카오톡 플러스친구 프로필 이미지',
        initial_comment: this.buildMessageWithReference(message, referenceUrl)
      });

      if (!uploadResult.ok) {
        throw new Error(`Slack upload failed: ${uploadResult.error}`);
      }

      logger.info(`Image uploaded successfully to Slack channel: ${channelId}`);

      // 2. Wait 3 seconds to ensure image is fully posted
      logger.info('Waiting 3 seconds before posting button...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. Post buttons right below the image (as next message in channel)
      const blocks = [
        {
          type: 'actions',
          block_id: 'menu_actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '👀 메뉴 미리보기',
                emoji: true
              },
              style: 'primary',
              action_id: 'preview_lunch_menu'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🎲 메뉴가 마음에 안 들어요',
                emoji: true
              },
              style: 'danger',
              action_id: 'change_lunch_menu'
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '💡 미리보기로 대체 메뉴를 확인하고, 마음에 들면 확정할 수 있어요!\n(오늘 처음 확정하는 사람의 선택이 전체에 공유됩니다)'
            }
          ]
        }
      ];

      const messageResult = await this.client.chat.postMessage({
        channel: channelId,
        text: '메뉴 변경 버튼',
        blocks: blocks
      });

      if (messageResult.ok) {
        logger.info(`Message with button posted successfully to channel: ${channelId}`);
        return {
          success: true,
          fileId: uploadResult.file?.id || uploadResult.files?.[0]?.id || 'unknown',
          permalink: uploadResult.file?.permalink || uploadResult.files?.[0]?.permalink || 'unknown',
          messageTs: messageResult.ts
        };
      } else {
        throw new Error(`Slack message failed: ${messageResult.error}`);
      }

    } catch (error) {
      logger.error('Error uploading image with button to Slack:', error);
      throw error;
    }
  }

  buildMessageWithReference(message, referenceUrl) {
    if (!referenceUrl) {
      return message;
    }
    
    return `${message}\n\n🔗 *참조 사이트:* <${referenceUrl}|카카오톡 플러스친구 페이지>`;
  }

  async sendMessage(channelId, text) {
    try {
      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: text
            }
          }
        ]
      });

      if (result.ok) {
        logger.info(`Message sent successfully to Slack channel: ${channelId}`);
        return result;
      } else {
        throw new Error(`Slack message failed: ${result.error}`);
      }

    } catch (error) {
      logger.error('Error sending message to Slack:', error);
      throw error;
    }
  }

  async sendMessageWithButton(channelId, text, buttonText, buttonActionId, buttonStyle = 'primary') {
    try {
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: text
          }
        },
        {
          type: 'actions',
          block_id: 'admin_actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: buttonText,
                emoji: true
              },
              style: buttonStyle,
              action_id: buttonActionId
            }
          ]
        }
      ];

      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: text,
        blocks: blocks
      });

      if (result.ok) {
        logger.info(`Message with button sent successfully to Slack channel: ${channelId}`);
        return result;
      } else {
        throw new Error(`Slack message failed: ${result.error}`);
      }

    } catch (error) {
      logger.error('Error sending message with button to Slack:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      const result = await this.client.auth.test();
      if (result.ok) {
        logger.info(`Slack connection test successful. Bot user: ${result.user}`);
        return {
          success: true,
          user: result.user,
          team: result.team
        };
      } else {
        throw new Error(`Slack auth test failed: ${result.error}`);
      }
    } catch (error) {
      logger.error('Slack connection test failed:', error);
      throw error;
    }
  }

  async sendEphemeralMessage(channelId, userId, text, blocks = null) {
    try {
      const message = {
        channel: channelId,
        user: userId,
        text: text
      };

      if (blocks) {
        message.blocks = blocks;
      }

      const result = await this.client.chat.postEphemeral(message);

      if (result.ok) {
        logger.info(`Ephemeral message sent to user ${userId} in channel ${channelId}`);
        return result;
      } else {
        throw new Error(`Slack ephemeral message failed: ${result.error}`);
      }

    } catch (error) {
      logger.error('Error sending ephemeral message to Slack:', error);
      throw error;
    }
  }

  async getChannelInfo(channelId) {
    try {
      const result = await this.client.conversations.info({
        channel: channelId
      });

      if (result.ok) {
        logger.info(`Channel info retrieved: ${result.channel.name}`);
        return result.channel;
      } else {
        throw new Error(`Failed to get channel info: ${result.error}`);
      }
    } catch (error) {
      logger.error('Error getting channel info:', error);
      throw error;
    }
  }

  async postActionButtons(channelId) {
    try {
      const blocks = [
        {
          type: 'actions',
          block_id: 'menu_actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '👀 메뉴 미리보기',
                emoji: true
              },
              style: 'primary',
              action_id: 'preview_lunch_menu'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🎲 메뉴가 마음에 안 들어요',
                emoji: true
              },
              style: 'danger',
              action_id: 'change_lunch_menu'
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '💡 미리보기로 대체 메뉴를 확인하고, 마음에 들면 확정할 수 있어요!\n(오늘 처음 확정하는 사람의 선택이 전체에 공유됩니다)'
            }
          ]
        }
      ];

      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: '메뉴 변경 버튼',
        blocks: blocks
      });

      if (result.ok) {
        logger.info(`Action buttons posted successfully to channel: ${channelId}`);
        return {
          success: true,
          messageTs: result.ts
        };
      } else {
        throw new Error(`Slack message failed: ${result.error}`);
      }

    } catch (error) {
      logger.error('Error posting action buttons to Slack:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async postIndoorMenuChangeButton(channelId) {
    try {
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🤔 *혹시 이 메뉴가 마음에 안 드시나요?*'
          }
        },
        {
          type: 'actions',
          block_id: 'indoor_menu_actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🔄 다른 실내 메뉴로 변경',
                emoji: true
              },
              style: 'primary',
              action_id: 'reroll_lunch_menu'
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '💡 날씨가 추워서 실내 메뉴만 추천됩니다. 버튼을 누르면 다른 실내 메뉴로 변경돼요!'
            }
          ]
        }
      ];

      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: '실내 메뉴 변경 버튼',
        blocks: blocks
      });

      if (result.ok) {
        logger.info(`Indoor menu change button posted successfully to channel: ${channelId}`);
        return {
          success: true,
          messageTs: result.ts
        };
      } else {
        throw new Error(`Slack message failed: ${result.error}`);
      }

    } catch (error) {
      logger.error('Error posting indoor menu change button to Slack:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SlackClient;