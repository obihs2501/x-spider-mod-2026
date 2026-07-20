export interface Settings_V1 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    savePath: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
  };
}

export interface Settings_V2 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    saveDirBase: string;
    dirTemplate: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
    consecutiveSkipThreshold: number;
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
    writeLogs: boolean;
    theme?: 'light' | 'dark';
  };
}

export interface Settings_V3 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    saveDirBase: string;
    dirTemplate: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
    consecutiveSkipThreshold: number;
  };
  accountRotation: {
    /** 每开始一个博主的批量任务时切换到下一个账号 */
    rotateOnBlogger: boolean;
    /** 每 N 次 API 请求切换账号，0 表示关闭 */
    rotateEveryNRequests: number;
    /** 收到 429 后该账号的冷却时长（分钟） */
    rateLimitCooldownMinutes: number;
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
    writeLogs: boolean;
    theme?: 'light' | 'dark';
  };
}

export interface Settings_V4 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    saveDirBase: string;
    dirTemplate: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
    consecutiveSkipThreshold: number;
  };
  accountRotation: {
    /** 每开始一个博主的批量任务时切换到下一个账号 */
    rotateOnBlogger: boolean;
    /** 每 N 次 API 请求切换账号，0 表示关闭 */
    rotateEveryNRequests: number;
    /** 收到 429 后该账号的冷却时长（分钟） */
    rateLimitCooldownMinutes: number;
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
    writeLogs: boolean;
    /** 输出的最低日志等级 */
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    /** 日志文件保留天数，0 表示不自动清理 */
    logRetentionDays: number;
    theme?: 'light' | 'dark';
  };
}

export type Settings = Settings_V4;
