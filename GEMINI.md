# GEMINI.md

This file provides guidance to Gemini when working with code in this repository.

## Project Overview

This is a Node.js project that scrapes a KakaoTalk Plus Friend's profile image and sends it to a Slack channel at a scheduled time. It uses Puppeteer for web scraping, `@slack/web-api` for Slack integration, and `node-cron` for scheduling.

## Building and Running

### Installation

```bash
npm install
```

### Environment Setup

1.  Copy `.env.example` to `.env`.
2.  Fill in the required environment variables in the `.env` file:
    *   `SLACK_BOT_TOKEN`: Your Slack bot token.
    *   `SLACK_CHANNEL_ID`: The ID of the Slack channel where the image will be posted.
    *   `KAKAO_PLUS_FRIEND_URL`: The URL of the KakaoTalk Plus Friend's profile page.
    *   `SCHEDULE_CRON`: (Optional) A cron expression to define the schedule (defaults to `0 9 * * *`).
    *   `LOG_LEVEL`: (Optional) The logging level (e.g., `info`, `debug`).

### Running the Bot

*   **Start the bot in production mode:**

    ```bash
    npm start
    ```

*   **Start the bot in development mode (with auto-restarting):**

    ```bash
    npm run dev
    ```

*   **Run the task immediately for testing:**

    ```bash
    npm start -- --test
    ```

*   **Check the bot's status:**

    ```bash
    npm start -- --status
    ```

### Testing

```bash
npm test
```

## Development Conventions

*   **Configuration:** All configuration is managed through environment variables, loaded via the `dotenv` package and centralized in `src/config/index.js`.
*   **Logging:** The `winston` library is used for logging. Logs are output to the console and to files in the `logs` directory (`app.log` and `error.log`).
*   **Scheduling:** The `node-cron` library is used for scheduling tasks. The main task is defined in `src/index.js` and managed by the `TaskScheduler` class in `src/scheduler/index.js`.
*   **Error Handling:** The application includes error handling with Slack notifications for failed tasks.
*   **Code Structure:** The code is organized into services, a scheduler, utilities, and a main application entry point.
    *   `src/services/kakaoScraper.js`: Handles the web scraping logic using Puppeteer.
    *   `src/services/slackClient.js`: Interacts with the Slack API.
    *   `src/scheduler/index.js`: Manages scheduled tasks.
    *   `src/index.js`: The main application entry point.
