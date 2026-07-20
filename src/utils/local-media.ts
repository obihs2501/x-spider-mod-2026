import { AriaStatus } from './aria2';
import { DownloadTask } from '../interfaces/DownloadTask';

/** 拼接下载任务的本地文件完整路径 */
export function joinTaskPath(dir: string, fileName: string): string {
  if (dir.endsWith('\\') || dir.endsWith('/')) return dir + fileName;
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir + sep + fileName;
}

/**
 * 从下载任务列表构建 media.id → 本地文件路径 的映射（仅已完成任务）。
 * 用于主页 / 帖子预览时优先加载本地媒体，减少网络请求与网页跳转。
 */
export function buildLocalMediaPathMap(
  tasks: DownloadTask[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const task of tasks) {
    if (task.status !== AriaStatus.Complete) continue;
    if (!task.media?.id || !task.dir || !task.fileName) continue;
    map.set(task.media.id, joinTaskPath(task.dir, task.fileName));
  }
  return map;
}
