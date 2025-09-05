# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KakaoTalk-Slack Profile Sync Bot: A Node.js application that automatically scrapes KakaoTalk Plus Friend profile images and posts them to Slack channels on a scheduled basis.

## Development Commands

```bash
# Install dependencies
npm install

# Run the bot (production mode)
npm start

# Run in development mode with auto-restart
npm run dev

# Test mode - run immediately without waiting for schedule
npm start -- --test

# Check bot status and configuration
npm start -- --status

# Run tests
npm test
```

## Environment Setup

1. Copy `.env.example` to `.env` and configure:
   - `SLACK_BOT_TOKEN`: Bot token from Slack App (starts with xoxb-)
   - `SLACK_CHANNEL_ID`: Target channel ID for image posting
   - `KAKAO_PLUS_FRIEND_URL`: KakaoTalk Plus Friend page URL to monitor
   - `SCHEDULE_CRON`: Cron expression for scheduling (default: daily 9 AM)
   - `LOG_LEVEL`: Logging level (error, warn, info, debug)

2. Slack App setup required with permissions: `chat:write`, `files:write`, `channels:read`

## Architecture

### Core Components

- **KakaoScraper** (`src/services/kakaoScraper.js`): Puppeteer-based web scraping for profile images
- **SlackClient** (`src/services/slackClient.js`): Slack Web API integration for image uploads
- **TaskScheduler** (`src/scheduler/index.js`): Cron-based job scheduling system
- **Configuration** (`src/config/index.js`): Centralized environment variable management
- **Logger** (`src/utils/logger.js`): Winston-based logging with file rotation

### Key Patterns

- **Error Handling**: Comprehensive try-catch with Slack error notifications
- **Scheduling**: node-cron with timezone support and manual execution capability  
- **Logging**: Structured logging with file rotation and multiple transports
- **Resource Management**: Proper browser cleanup and connection management

### Dependencies

- `puppeteer`: Web scraping and automation
- `@slack/web-api`: Slack API client
- `node-cron`: Task scheduling
- `winston`: Advanced logging
- `dotenv`: Environment variable management