import { invoke } from '@tauri-apps/api';
import { Response } from '../interfaces/Response';
import { RequestOptions } from '../interfaces/RequestOptions';
import * as R from 'ramda';
import { useSettingsStore } from '../stores/settings';
import { delay } from '../utils';

const MAX_RETRY_COUNT = 16;
const MAX_RETRY_DELAY = 16000;

let log: ICategoriedLogger;

export async function request(options: RequestOptions) {
  if (!log) {
    log = window.log.category('NET');
  }
  const url = new URL(options.url);

  if (options.query) {
    Object.entries(options.query).forEach(([k, v]) => {
      url.searchParams.append(k, v);
    });
  }

  const settings = useSettingsStore.getState();
  let remainingRetryCount = MAX_RETRY_COUNT;
  let retryDelay = 100;
  let lastErr: any;
  let headers = R.defaultTo({}, options.headers);

  // 429 时尝试通过回调换取新的鉴权头（账号池切号）；成功则立即重试
  const trySwitchHeadersOn429 = async (): Promise<boolean> => {
    if (!options.on429) return false;
    try {
      const newHeaders = await options.on429();
      if (newHeaders) {
        headers = newHeaders;
        return true;
      }
    } catch (err) {
      log.warn('on429 handler failed', err);
    }
    return false;
  };

  while (remainingRetryCount > 0) {
    try {
      await options.beforeAttempt?.();
      if (options.getHeaders) {
        headers = await options.getHeaders();
      }
      const res = await requestInternal(
        R.defaultTo('GET', options.method),
        url.href,
        R.defaultTo('', options.body),
        settings.proxy.enable,
        settings.proxy.useSystem ? '' : settings.proxy.url,
        headers,
        options.responseType,
      );
      options.afterResponse?.(res);

      if (res.status === 429 && (await trySwitchHeadersOn429())) {
        log.warn('Got 429 response, switched account and retry');
        remainingRetryCount--;
        continue;
      }

      return res;
    } catch (err: any) {
      lastErr = err;
      const errText = String(err?.message || err || '');
      // 429 速率限制可重试，其他 4xx/5xx 和 JSON 解析错误不可重试
      const is429 = errText.includes('HTTP 429');

      if (is429 && (await trySwitchHeadersOn429())) {
        log.warn('Got 429 error, switched account and retry');
        remainingRetryCount--;
        continue;
      }

      const nonRetryable =
        !is429 &&
        (errText.includes('响应不是有效 JSON') ||
          errText.includes('HTTP 4') ||
          errText.includes('HTTP 5'));

      // 429 使用更长的延迟
      const effectiveDelay = is429 ? Math.max(retryDelay, 5000) : retryDelay;

      log.warn(
        nonRetryable
          ? 'Request failed with a non-retryable response'
          : `Request failed, retry after ${effectiveDelay}ms, remaining retry count: ${remainingRetryCount}`,
        err,
      );
      // GraphQL queryId 失效、HTML 错误页、明确 HTTP 错误重试 16 次不会变好，
      // 直接上抛以避免批量任务每个博主卡数分钟。
      if (nonRetryable) throw err;
      await delay(effectiveDelay);
      await delay(effectiveDelay);
      remainingRetryCount--;
      retryDelay *= 2;
      if (retryDelay > MAX_RETRY_DELAY) {
        retryDelay = MAX_RETRY_DELAY;
      }
    }
  }

  log.error('Max retry count reached, last error:', lastErr);
  throw lastErr;
}

let reqIdGlobal = 0;

async function requestInternal(
  method: string,
  url: string,
  body: string,
  enableProxy: boolean,
  proxyUrl: string,
  headers: Record<string, string>,
  responseType: string,
): Promise<Response> {
  const startTs = Date.now();
  const reqId = reqIdGlobal++;
  log.info(`REQ_${reqId}`, method, url, {
    body,
    enableProxy,
    proxyUrl,
    headers: {
      ...headers,
      Cookie: headers.Cookie ? '******' : undefined,
    },
    responseType,
  });

  const res = await invoke<Response>('network_fetch', {
    method,
    url,
    body,
    enableProxy,
    proxyUrl,
    headers,
    responseType,
  });

  const endTs = Date.now() - startTs;
  log.info(`RES_${reqId}(+${endTs}ms)`, res.status, url, res);

  return res;
}

export async function getSystemProxy(): Promise<string> {
  const map: Record<string, string> = await invoke(
    'network_get_system_proxy_url',
  );
  const value = map.https || map.http;
  if (value) {
    return `http://${value}`;
  }
  return '';
}
