import { useAppStateStore } from '../stores/app-state';
import { useSettingsStore } from '../stores/settings';

export function useResolvedProxyUrl() {
  const systemProxyUrl = useAppStateStore((state) => state.systemProxyUrl);
  const proxyConfig = useSettingsStore((state) => state.proxy);

  if (!proxyConfig.enable) return '';
  // 系统代理未开启（解析为空）时回退到手动地址，避免 aria2 拿到空代理直连失败
  if (proxyConfig.useSystem) return systemProxyUrl || proxyConfig.url;
  return proxyConfig.url;
}
