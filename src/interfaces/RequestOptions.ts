export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  url: string;
  query?: Record<string, any>;
  headers?: Record<string, string>;
  body?: any;
  responseType: 'json' | 'text' | 'binary';
  /**
   * 收到 429（速率限制）时调用。返回新的请求头（如切换账号后重建的鉴权头）
   * 则立即用新头重试；返回 null 表示无法切换，走默认的延迟重试。
   */
  on429?: () => Promise<Record<string, string> | null>;
}
