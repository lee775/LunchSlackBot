const { WebClient } = require('@slack/web-api');
const logger = require('../utils/logger');

class SlackClient {
  constructor(botToken) {
    this.client = new WebClient(botToken);
  }

  async uploadAndPostImage(channelId, imageBuffer, filename = 'kakao_profile.jpg', message = '', referenceUrl = '') {
    try {
      // 새로운 files.uploadV2 API 사용
      const uploadResult = await this.client.files.uploadV2({
        channel_id: channelId,
        file: imageBuffer,
        filename: filename,
        title: '카카오톡 플러스친구 프로필 이미지',
        initial_comment: this.buildMessageWithReference(message || `📸 매일 업데이트되는 카카오톡 플러스친구 프로필 이미지입니다. (${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`, referenceUrl)
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
}

module.exports = SlackClient;