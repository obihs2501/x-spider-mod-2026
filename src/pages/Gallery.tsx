/* eslint-disable react/prop-types */
import { fs, shell, tauri } from '@tauri-apps/api';
import { App, Button, Empty, Image, Segmented, Spin } from 'antd';
import {
  ArrowLeftOutlined,
  FolderFilled,
  FolderOpenOutlined,
  PlayCircleFilled,
  ReloadOutlined,
} from '@ant-design/icons';
import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { useSettingsStore } from '../stores/settings';
import {
  GALLERY_PAGE_SIZE,
  GalleryFolder,
  useGalleryStore,
} from '../stores/gallery';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'm4v'];

const COLUMN_OPTIONS = [3, 4, 5, 6, 8];
const COLUMN_CLASS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  8: 'grid-cols-8',
};

function classifyFile(name: string): 'image' | 'video' | null {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  return null;
}

/** 视频占位块，点击后才真正挂载 <video>，避免批量加载吃内存 */
const VideoTile: React.FC<{ src: string; name: string }> = ({ src, name }) => {
  const [active, setActive] = useState(false);
  if (active) {
    return (
      <video
        src={src}
        controls
        autoPlay
        className="w-full h-full object-contain bg-black"
      />
    );
  }
  return (
    <button
      className="w-full h-full flex flex-col items-center justify-center bg-[#3D3929] text-white"
      onClick={() => setActive(true)}
      title={`播放 ${name}`}
    >
      <PlayCircleFilled className="text-4xl opacity-80" />
      <span className="mt-2 text-xs opacity-60">点击播放</span>
    </button>
  );
};

export const Gallery: React.FC = () => {
  const { message } = App.useApp();
  const saveDirBase = useSettingsStore((s) => s.download.saveDirBase);
  const [loading, setLoading] = useState(false);
  const {
    folders,
    setFolders,
    foldersLoaded,
    setFoldersLoaded,
    currentFolder,
    setCurrentFolder,
    medias,
    setMedias,
    visibleCount,
    setVisibleCount,
    resetVisibleCount,
    columns,
    setColumns,
    fitMode,
    setFitMode,
  } = useGalleryStore();

  // 顶层：只读取一层子文件夹列表（不递归，开销极小）
  const loadFolders = useCallback(async () => {
    if (!saveDirBase) return;
    setLoading(true);
    try {
      if (!(await fs.exists(saveDirBase))) {
        setFolders([]);
        return;
      }
      const entries = await fs.readDir(saveDirBase);
      // 非递归 readDir 无法直接区分目录，对非媒体文件名的条目试探 readDir
      const result: GalleryFolder[] = [];
      for (const e of entries) {
        if (!e.name || classifyFile(e.name)) continue;
        try {
          await fs.readDir(e.path);
          result.push({ name: e.name, path: e.path });
        } catch {
          // 非目录，跳过
        }
      }
      result.sort((a, b) => a.name.localeCompare(b.name));
      setFolders(result);
      setFoldersLoaded(true);
    } catch (err: any) {
      log.error(err);
      message.error(`读取目录失败：${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [saveDirBase, message, setFolders, setFoldersLoaded]);

  // 进入某个子文件夹：只扫描该文件夹（递归其内部）
  const openFolder = useCallback(
    async (folder: GalleryFolder) => {
      setLoading(true);
      setCurrentFolder(folder);
      setMedias([]);
      resetVisibleCount();
      try {
        const entries = await fs.readDir(folder.path, { recursive: true });
        const list: {
          path: string;
          name: string;
          isVideo: boolean;
        }[] = [];
        const walk = (items: fs.FileEntry[]) => {
          for (const e of items) {
            if (e.children) {
              walk(e.children);
              continue;
            }
            const kind = classifyFile(e.name || '');
            if (kind) {
              list.push({
                path: e.path,
                name: e.name || '',
                isVideo: kind === 'video',
              });
            }
          }
        };
        walk(entries);
        list.sort((a, b) => b.name.localeCompare(a.name));
        setMedias(list);
      } catch (err: any) {
        log.error(err);
        message.error(`扫描文件失败：${err?.message || err}`);
      } finally {
        setLoading(false);
      }
    },
    [message, setCurrentFolder, setMedias, resetVisibleCount],
  );

  // 只在首次进入（或保存路径变化后）时扫描，之后使用缓存
  useEffect(() => {
    if (!foldersLoaded) {
      loadFolders();
    }
  }, [foldersLoaded, loadFolders]);

  const visibleMedias = medias.slice(0, visibleCount);

  return (
    <div className="flex flex-col h-screen">
      <PageHeader />
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {currentFolder ? (
          <>
            <Button
              icon={<ArrowLeftOutlined />}
              size="small"
              onClick={() => {
                setCurrentFolder(null);
                setMedias([]);
              }}
            >
              返回
            </Button>
            <h2 className="font-bold text-lg truncate max-w-[30%]">
              {currentFolder.name}
            </h2>
            <span className="text-gray-400 text-sm">
              共 {medias.length} 个文件
            </span>
            <Button
              icon={<ReloadOutlined />}
              size="small"
              loading={loading}
              onClick={() => openFolder(currentFolder)}
            >
              重新扫描
            </Button>
            <Button
              icon={<FolderOpenOutlined />}
              size="small"
              onClick={() => shell.open(currentFolder.path)}
            >
              打开目录
            </Button>
            <span className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-gray-400">每行</span>
              <Segmented
                size="small"
                value={columns}
                onChange={(v) => setColumns(v as number)}
                options={COLUMN_OPTIONS}
              />
              <Segmented
                size="small"
                value={fitMode}
                onChange={(v) => setFitMode(v as 'cover' | 'contain')}
                options={[
                  { label: '裁剪填充', value: 'cover' },
                  { label: '完整显示', value: 'contain' },
                ]}
              />
            </span>
          </>
        ) : (
          <>
            <h2 className="font-bold text-lg">本地画廊</h2>
            <span className="text-gray-400 text-sm">
              {folders.length} 个文件夹
            </span>
            <Button
              icon={<ReloadOutlined />}
              size="small"
              loading={loading}
              onClick={loadFolders}
            >
              刷新
            </Button>
            <Button
              icon={<FolderOpenOutlined />}
              size="small"
              disabled={!saveDirBase}
              onClick={() => saveDirBase && shell.open(saveDirBase)}
            >
              打开根目录
            </Button>
          </>
        )}
      </div>

      {!saveDirBase && (
        <Empty description="请先在「设置」中配置保存路径" className="mt-20" />
      )}

      {loading && (
        <div className="flex justify-center mt-20">
          <Spin tip="正在读取…" />
        </div>
      )}

      {/* 文件夹列表视图 */}
      {saveDirBase && !loading && !currentFolder && (
        <div className="grow overflow-auto pb-6">
          {folders.length === 0 ? (
            <Empty description="保存目录下暂无文件夹" className="mt-20" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {folders.map((f) => (
                <button
                  key={f.path}
                  className="flex items-center gap-3 p-4 bg-white border-[1px] rounded-xl text-left hover:shadow-md transition-shadow"
                  onClick={() => openFolder(f)}
                  title={f.name}
                >
                  <FolderFilled className="text-2xl text-ant-color-primary shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 文件夹内媒体视图（分页渲染） */}
      {!loading && currentFolder && (
        <div className="grow overflow-auto pb-6">
          {medias.length === 0 ? (
            <Empty description="该文件夹内没有媒体文件" className="mt-20" />
          ) : (
            <>
              <Image.PreviewGroup>
                <div
                  className={`grid ${COLUMN_CLASS[columns] || 'grid-cols-5'} gap-2`}
                >
                  {visibleMedias.map((m) => {
                    const src = tauri.convertFileSrc(m.path);
                    return (
                      <div
                        key={m.path}
                        className="relative rounded-lg overflow-hidden aspect-square bg-[#F0EEE6]"
                        title={m.name}
                      >
                        {m.isVideo ? (
                          <VideoTile src={src} name={m.name} />
                        ) : (
                          <Image
                            src={src}
                            alt={m.name}
                            loading="lazy"
                            width="100%"
                            height="100%"
                            style={{ objectFit: fitMode, height: '100%' }}
                          />
                        )}
                        <span className="absolute left-1 bottom-1 right-1 truncate bg-black/60 text-white text-[10px] px-1 rounded pointer-events-none">
                          {m.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Image.PreviewGroup>
              {visibleCount < medias.length && (
                <div className="flex justify-center mt-4">
                  <Button
                    onClick={() =>
                      setVisibleCount((c) => c + GALLERY_PAGE_SIZE)
                    }
                  >
                    加载更多（已显示 {visibleMedias.length} / {medias.length}）
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
