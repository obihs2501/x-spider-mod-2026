/* eslint-disable no-console */

import dayjs, { Dayjs } from 'dayjs';
import { path, fs } from '@tauri-apps/api';
import { useSettingsStore } from '../stores/settings';

const DEFAULT_CATEGORY = 'APP';

// 日志级别严重度：数值越小越重要；输出时低于设置级别的日志会被过滤
const LEVEL_SEVERITY: Record<string, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

function isLevelEnabled(level: string): boolean {
  const configured = (
    useSettingsStore.getState().app.logLevel || 'info'
  ).toUpperCase();
  return (LEVEL_SEVERITY[level] ?? 2) <= (LEVEL_SEVERITY[configured] ?? 2);
}

/** 从日志文件名（YYYY-MM-DD HHmmss.log）解析出创建时间戳 */
function parseLogFileStamp(fileName: string): number | null {
  const m = fileName.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})\.log$/,
  );
  if (!m) return null;
  const ts = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  ).getTime();
  return Number.isNaN(ts) ? null : ts;
}

/**
 * 清理过期日志文件（按文件名里的日期判断）。
 * 保留天数取设置 app.logRetentionDays，0 表示不清理；等待设置加载完成后执行。
 */
export async function cleanupOldLogs() {
  const persistApi = useSettingsStore.persist;
  if (!persistApi.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const unsub = persistApi.onFinishHydration(() => {
        unsub();
        resolve();
      });
    });
  }

  const days = Number(useSettingsStore.getState().app.logRetentionDays);
  if (!days || days <= 0 || Number.isNaN(days)) return;

  const logDir = await path.appLogDir();
  if (!(await fs.exists(logDir))) return;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const entries = await fs.readDir(logDir);
  let removed = 0;
  for (const entry of entries) {
    const stamp = parseLogFileStamp(entry.name || '');
    if (stamp === null || stamp >= cutoff) continue;
    try {
      await fs.removeFile(entry.path);
      removed++;
    } catch (err) {
      console.warn('Remove expired log file failed', entry.name, err);
    }
  }
  if (removed > 0) {
    window.log.info(
      `Cleaned ${removed} expired log file(s), retention ${days} day(s)`,
    );
  }
}

export class Logger implements ILogger {
  #now = dayjs();
  #logFileBuffers: string[] = [];
  #logFileTimeoutId: number | undefined;

  info(...messages: any[]) {
    this.#log('INFO', DEFAULT_CATEGORY, ...messages);
  }
  warn(...messages: any[]) {
    this.#log('WARN', DEFAULT_CATEGORY, ...messages);
  }
  error(...messages: any[]) {
    this.#log('ERROR', DEFAULT_CATEGORY, ...messages);
  }
  debug(...messages: any[]) {
    this.#log('DEBUG', DEFAULT_CATEGORY, ...messages);
  }
  category(name: string): ICategoriedLogger {
    return {
      info: (...messages: any[]) => {
        this.#log('INFO', name, ...messages);
      },
      warn: (...messages: any[]) => {
        this.#log('WARN', name, ...messages);
      },
      error: (...messages: any[]) => {
        this.#log('ERROR', name, ...messages);
      },
      debug: (...messages: any[]) => {
        this.#log('DEBUG', name, ...messages);
      },
    };
  }

  async #getLogFilePath() {
    const fileName = `${this.#now.format('YYYY-MM-DD HHmmss')}.log`;
    const logDir = await path.appLogDir();

    if (!(await fs.exists(logDir))) {
      await fs.createDir(logDir);
    }

    return await path.join(logDir, fileName);
  }

  #log(level: string, category: string, ...messages: any[]) {
    try {
      if (!isLevelEnabled(level)) return;
      const time = dayjs();
      this.#logConsole(level, time, category, ...messages);

      if (useSettingsStore.getState().app.writeLogs) {
        this.#logFile(level, time, category, ...messages);
      }
    } catch (err) {
      console.error('Log error', err);
    }
  }

  #logFile(level: string, time: Dayjs, category: string, ...messages: any[]) {
    const fmtTime = time.toISOString();
    const msg = `${fmtTime} [${level}] <${category}> ${messages
      .map((m) => {
        if (m instanceof Error) {
          return JSON.stringify({
            type: 'Error',
            message: m.message,
            name: m.name,
          });
        }
        return JSON.stringify(m);
      })
      .join(' ')}`;
    this.#logFileBuffers.push(msg);
    clearTimeout(this.#logFileTimeoutId);

    this.#logFileTimeoutId = setTimeout(async () => {
      await fs.writeTextFile(
        await this.#getLogFilePath(),
        this.#logFileBuffers.join('\n') + '\n',
        {
          append: true,
        },
      );
      this.#logFileBuffers.length = 0;
    }, 500);
  }

  #logConsole(
    level: string,
    time: Dayjs,
    category: string,
    ...messages: any[]
  ) {
    let categoryColor = '#000000';

    if (category !== DEFAULT_CATEGORY) {
      const colorList = [
        '#f5222d',
        '#fa541c',
        '#fa8c16',
        '#faad14',
        '#d4b106',
        '#a0d911',
        '#52c41a',
        '#13c2c2',
        '#1677ff',
        '#2f54eb',
        '#722ed1',
        '#eb2f96',
      ];
      // Hash category name
      const hashedCategoryName = category
        .split('')
        .reduce((prev, curr) => prev + curr.charCodeAt(0), 0);
      categoryColor = colorList[hashedCategoryName % colorList.length];
    }

    const fmtTime = time.format('HH:mm:ss.SSS');

    const prefix = (level: string, color: string) => [
      `%c${fmtTime} %c[${level}]%c %c<${category}>%c`,
      'color: #aaa; font-weight: bold;',
      `color: white; font-weight: bold; background: ${color}`,
      'color: initial; background: initial; font-weight: initial;',
      `color: ${categoryColor}; font-weight: bold;`,
      'color: initial; background: initial; font-weight: initial;',
    ];

    switch (level) {
      case 'INFO':
        console.info(...prefix('INFO', '#52c41a'), ...messages);
        break;
      case 'WARN':
        console.warn(...prefix('WARN', '#d4b106'), ...messages);
        break;
      case 'ERROR':
        console.error(...prefix('ERROR', '#f5222d'), ...messages);
        break;
      case 'DEBUG':
        console.debug(...prefix('DEBUG', 'black'), ...messages);
        break;
    }
  }
}
