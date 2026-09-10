import { dialog, fs } from '@tauri-apps/api';
import dayjs from 'dayjs';
import { DownloadTask } from '../interfaces/DownloadTask';
import { buildPostUrl } from '../twitter/url';

/**
 * 弹出保存对话框并写入文本文件。
 * 返回实际保存的路径；用户取消时返回 null。
 */
export async function saveTextFile(
  defaultName: string,
  content: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const target = await dialog.save({ defaultPath: defaultName, filters });
  if (!target) return null;
  await fs.writeTextFile(target, content);
  return target;
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 生成带 BOM 的 CSV 文本（Excel 可直接打开且不乱码） */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}`;
}

const STATUS_LABEL: Record<string, string> = {
  active: '下载中',
  waiting: '等待中',
  paused: '已暂停',
  error: '错误',
  complete: '已完成',
  removed: '已移除',
};

/** 把下载任务记录整理成可导出的扁平行 */
export function flattenDownloadTasks(tasks: DownloadTask[]) {
  return tasks.map((t) => {
    const screenName = t.post?.user?.screenName || '';
    return {
      状态: STATUS_LABEL[t.status] || t.status,
      文件名: t.fileName,
      保存目录: t.dir,
      博主昵称: t.post?.user?.name || '',
      博主用户名: screenName,
      推文ID: t.post?.id || '',
      推文链接:
        screenName && t.post?.id ? buildPostUrl(screenName, t.post.id) : '',
      推文时间: t.post?.createdAt
        ? dayjs(t.post.createdAt).format('YYYY-MM-DD HH:mm:ss')
        : '',
      推文内容: t.post?.fullText || '',
      标签: (t.post?.tags || []).join(' '),
      媒体类型: t.media?.type || '',
      媒体链接: t.downloadUrl,
      文件大小: Number.isFinite(t.totalSize) ? t.totalSize : '',
      更新时间: dayjs(t.updatedAt).format('YYYY-MM-DD HH:mm:ss'),
      错误信息: t.error || '',
    };
  });
}

export async function exportDownloadTasks(
  tasks: DownloadTask[],
  format: 'csv' | 'json',
): Promise<string | null> {
  const rows = flattenDownloadTasks(tasks);
  const stamp = dayjs().format('YYYYMMDD-HHmmss');
  if (format === 'json') {
    return saveTextFile(
      `x-spider-downloads-${stamp}.json`,
      JSON.stringify(rows, null, 2),
      [{ name: 'JSON', extensions: ['json'] }],
    );
  }
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return saveTextFile(
    `x-spider-downloads-${stamp}.csv`,
    toCsv(
      headers,
      rows.map((row) => headers.map((h) => (row as any)[h])),
    ),
    [{ name: 'CSV', extensions: ['csv'] }],
  );
}

/**
 * 解析粘贴的用户名列表：支持换行 / 逗号 / 空格分隔，@ 前缀，以及 x.com/xxx 链接。
 * 返回去重后的用户名（保持顺序）。
 */
export function parseScreenNameList(text: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;，；]+/)) {
    let token = raw.trim();
    if (!token) continue;
    const urlMatch = token.match(
      /(?:x|twitter)\.com\/(?:#!\/)?@?([A-Za-z0-9_]{1,20})/i,
    );
    if (urlMatch) token = urlMatch[1];
    token = token.replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{1,20}$/.test(token)) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}
