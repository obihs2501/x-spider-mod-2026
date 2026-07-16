/* eslint-disable react/prop-types */
import { fs, shell, tauri } from '@tauri-apps/api';
import { App, Button, Empty, Image, Spin } from 'antd';
import { FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons';
import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { useSettingsStore } from '../stores/settings';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'm4v'];

interface LocalMedia {
  path: string;
  name: string;
  isVideo: boolean;
}

/** 递归扫描目录下的媒体文件 */
async function scanDir(dir: string): Promise<LocalMedia[]> {
  const entries = await fs.readDir(dir, { recursive: true });
  const result: LocalMedia[] = [];

  const walk = (list: fs.FileEntry[]) => {
    for (const entry of list) {
      if (entry.children) {
        walk(entry.children);
        continue;
      }
      const name = entry.name || '';
      const ext = name.split('.').pop()?.toLowerCase() || '';
      if (IMAGE_EXTS.includes(ext)) {
        result.push({ path: entry.path, name, isVideo: false });
      } else if (VIDEO_EXTS.includes(ext)) {
        result.push({ path: entry.path, name, isVideo: true });
      }
    }
  };
  walk(entries);
  return result;
}

export const Gallery: React.FC = () => {
  const { message } = App.useApp();
  const saveDirBase = useSettingsStore((s) => s.download.saveDirBase);
  const [loading, setLoading] = useState(false);
  const [medias, setMedias] = useState<LocalMedia[]>([]);

  const refresh = useCallback(async () => {
    if (!saveDirBase) {
      setMedias([]);
      return;
    }
    setLoading(true);
    try {
      const exists = await fs.exists(saveDirBase);
      if (!exists) {
        setMedias([]);
        return;
      }
      const list = await scanDir(saveDirBase);
      // 按文件名倒序，较新的在前
      list.sort((a, b) => b.name.localeCompare(a.name));
      setMedias(list);
    } catch (err: any) {
      log.error(err);
      message.error(`扫描本地文件失败：${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [saveDirBase, message]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col h-screen">
      <PageHeader />
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-bold text-lg">本地画廊</h2>
        <span className="text-gray-400 text-sm">
          共 {medias.length} 个文件
        </span>
        <Button
          icon={<ReloadOutlined />}
          size="small"
          loading={loading}
          onClick={refresh}
        >
          刷新
        </Button>
        <Button
          icon={<FolderOpenOutlined />}
          size="small"
          disabled={!saveDirBase}
          onClick={() => saveDirBase && shell.open(saveDirBase)}
        >
          打开目录
        </Button>
      </div>

      {!saveDirBase && (
        <Empty description="请先在「设置」中配置保存路径" className="mt-20" />
      )}

      {saveDirBase && loading && (
        <div className="flex justify-center mt-20">
          <Spin tip="正在扫描本地文件…" />
        </div>
      )}

      {saveDirBase && !loading && medias.length === 0 && (
        <Empty description="保存目录下暂无已下载的媒体" className="mt-20" />
      )}

      {!loading && medias.length > 0 && (
        <div className="grow overflow-auto pb-6">
          <Image.PreviewGroup>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {medias.map((m) => {
                const src = tauri.convertFileSrc(m.path);
                return (
                  <div
                    key={m.path}
                    className="relative bg-black rounded overflow-hidden aspect-square"
                    title={m.name}
                  >
                    {m.isVideo ? (
                      <video
                        src={src}
                        controls
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Image
                        src={src}
                        alt={m.name}
                        width="100%"
                        height="100%"
                        className="!object-cover"
                        style={{ objectFit: 'cover', height: '100%' }}
                      />
                    )}
                    <span className="absolute left-1 bottom-1 right-1 truncate bg-black/60 text-white text-[10px] px-1 rounded">
                      {m.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </Image.PreviewGroup>
        </div>
      )}
    </div>
  );
};
