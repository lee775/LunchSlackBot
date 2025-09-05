const cron = require('node-cron');
const logger = require('../utils/logger');

class TaskScheduler {
  constructor() {
    this.tasks = new Map();
  }

  addTask(name, cronExpression, taskFunction, options = {}) {
    try {
      // cron 표현식 유효성 검증
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      const task = cron.schedule(cronExpression, async () => {
        logger.info(`Starting scheduled task: ${name}`);
        const startTime = Date.now();
        
        try {
          await taskFunction();
          const duration = Date.now() - startTime;
          logger.info(`Task '${name}' completed successfully in ${duration}ms`);
        } catch (error) {
          logger.error(`Task '${name}' failed:`, error);
          
          // 에러 알림 콜백이 있으면 실행
          if (options.onError && typeof options.onError === 'function') {
            try {
              await options.onError(error, name);
            } catch (callbackError) {
              logger.error(`Error callback failed for task '${name}':`, callbackError);
            }
          }
        }
      }, {
        scheduled: false, // 수동으로 시작
        timezone: options.timezone || 'Asia/Seoul'
      });

      this.tasks.set(name, {
        task,
        cronExpression,
        options,
        isRunning: false
      });

      logger.info(`Task '${name}' registered with schedule: ${cronExpression}`);
      return task;

    } catch (error) {
      logger.error(`Failed to add task '${name}':`, error);
      throw error;
    }
  }

  startTask(name) {
    const taskInfo = this.tasks.get(name);
    if (!taskInfo) {
      throw new Error(`Task '${name}' not found`);
    }

    taskInfo.task.start();
    taskInfo.isRunning = true;
    logger.info(`Task '${name}' started`);
  }

  stopTask(name) {
    const taskInfo = this.tasks.get(name);
    if (!taskInfo) {
      throw new Error(`Task '${name}' not found`);
    }

    taskInfo.task.stop();
    taskInfo.isRunning = false;
    logger.info(`Task '${name}' stopped`);
  }

  startAllTasks() {
    for (const [name, taskInfo] of this.tasks) {
      if (!taskInfo.isRunning) {
        this.startTask(name);
      }
    }
    logger.info('All tasks started');
  }

  stopAllTasks() {
    for (const [name, taskInfo] of this.tasks) {
      if (taskInfo.isRunning) {
        this.stopTask(name);
      }
    }
    logger.info('All tasks stopped');
  }

  removeTask(name) {
    const taskInfo = this.tasks.get(name);
    if (!taskInfo) {
      throw new Error(`Task '${name}' not found`);
    }

    if (taskInfo.isRunning) {
      taskInfo.task.stop();
    }
    
    taskInfo.task.destroy();
    this.tasks.delete(name);
    logger.info(`Task '${name}' removed`);
  }

  getTaskStatus(name) {
    const taskInfo = this.tasks.get(name);
    if (!taskInfo) {
      return null;
    }

    return {
      name,
      cronExpression: taskInfo.cronExpression,
      isRunning: taskInfo.isRunning,
      options: taskInfo.options
    };
  }

  getAllTasksStatus() {
    const status = [];
    for (const [name] of this.tasks) {
      status.push(this.getTaskStatus(name));
    }
    return status;
  }

  // 즉시 실행 (테스트용)
  async runTaskNow(name) {
    const taskInfo = this.tasks.get(name);
    if (!taskInfo) {
      throw new Error(`Task '${name}' not found`);
    }

    logger.info(`Running task '${name}' immediately`);
    // 실제 스케줄된 함수를 찾기 위해 task의 내부 구조에 접근
    // 이는 node-cron의 내부 구현에 의존하므로 주의 필요
    try {
      // task 함수를 직접 호출하는 방법은 node-cron의 내부 API에 의존
      // 대신 별도의 콜백 저장 방식 사용
      if (taskInfo.taskFunction) {
        await taskInfo.taskFunction();
      } else {
        logger.warn(`Cannot run task '${name}' immediately - function not stored`);
      }
    } catch (error) {
      logger.error(`Immediate execution of task '${name}' failed:`, error);
      throw error;
    }
  }
}

module.exports = TaskScheduler;