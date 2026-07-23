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
  /** 每次尝试发起请求前调用（含重试），用于主动限流预算等待/切号 */
  beforeAttempt?: () => Promise<void>;
  /**
   * 每次尝试前重新解析请求头（含重试）。beforeAttempt 中切换账号后，
   * 依赖它让新账号的 Cookie 真正生效；返回值覆盖静态 headers。
   */
  getHeaders?: () => Promise<Record<string, string>>;
  /** 每次收到响应后调用（任何状态码），用于解析限流响应头记账 */
  afterResponse?: (res: import('./Response').Response) => void;
}
