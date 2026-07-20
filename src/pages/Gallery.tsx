/* eslint-disable react/prop-types */
import { fs, shell, tauri } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/tauri';
import { App, Button, Empty, Image, Segmented, Spin } from 'antd';
import {
  ArrowLeftOutlined,
  FolderFilled,
  FolderOpenOutlined,
  PlayCircleFilled,
  ReloadOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  SwapOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  ZoomOutOutlined,
  ZoomInOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PageHeader } from '../components/PageHeader';
import { useSettingsStore } from '../stores/settings';
import {
  GALLERY_PAGE_SIZE,
  GalleryFolder,
  useGalleryStore,
} from '../stores/gallery';
import { VideoPreviewModal } from '../components/media/VideoPreviewModal';

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

/** 视频占位块，点击后在可关闭预览层中播放，避免批量加载吃内存 */
const VideoTile: React.FC<{
  name: string;
  onPreview: () => void;
}> = ({ name, onPreview }) => (
  <button
    className="w-full h-full flex flex-col items-center justify-center bg-[#3D3929] text-white"
    onClick={onPreview}
    title={`预览 ${name}`}
  >
    <PlayCircleFilled className="text-4xl opacity-80" />
    <span className="mt-2 text-xs opacity-60">点击预览</span>
  </button>
);

// 画廊默认不自动刷新：只有从未扫描过或保存路径变化时才自动扫一次，
// 其余时候仅在用户点「刷新」时做增量校验（modifiedAt 对比）

export const Gallery: React.FC = () => {
  const { message } = App.useApp();
  const saveDirBase = useSettingsStore((s) => s.download.saveDirBase);
  const [loading, setLoading] = useState(false);
  const [videoPreview, setVideoPreview] = useState<{
    src: string;
    title: string;
    path: string;
  } | null>(null);
  const openFolderTokenRef = useRef(0);
  const {
    folders,
    setFolders,
    setFoldersLoaded,
    setFoldersDir,
    currentFolder,
    setCurrentFolder,
    medias,
    setMedias,
    mediaCache,
    setMediaCache,
    invalidateMediaCache,
    visibleCount,
    setVisibleCount,
    resetVisibleCount,
    columns,
    setColumns,
    fitMode,
    setFitMode,
    viewMode,
    setViewMode,
    folderSortBy,
    setFolderSortBy,
    folderSortOrder,
    setFolderSortOrder,
    mediaSortBy,
    setMediaSortBy,
    mediaSortOrder,
    setMediaSortOrder,
  } = useGalleryStore();
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

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
      const directoryEntries: fs.FileEntry[] = [];
      for (const entry of entries) {
        if (!entry.name || classifyFile(entry.name)) continue;
        try {
          await fs.readDir(entry.path);
          directoryEntries.push(entry);
        } catch {
          // 非目录，跳过
        }
      }
      const metadata = await invoke<{ path: string; modifiedAt?: number }[]>(
        'filesystem_metadata',
        {
          paths: directoryEntries.map((entry) => entry.path),
        },
      );
      const modifiedMap = new Map(
        metadata.map((item) => [item.path, item.modifiedAt]),
      );
      const previousMap = new Map(
        foldersRef.current.map((folder) => [folder.path, folder]),
      );
      const result: GalleryFolder[] = directoryEntries.map((entry) => {
        const modifiedAt = modifiedMap.get(entry.path);
        const previous = previousMap.get(entry.path);
        if (previous && previous.modifiedAt === modifiedAt) {
          // 目录未变化：复用摘要
          return previous;
        }
        // 目录有变化：失效旧媒体缓存，下次打开重新扫描
        invalidateMediaCache(entry.path);
        return {
          name: entry.name || '',
          path: entry.path,
          modifiedAt,
        };
      });
      // 删除已不存在目录的缓存
      const nextPaths = new Set(result.map((f) => f.path));
      Object.keys(useGalleryStore.getState().mediaCache).forEach((path) => {
        if (!nextPaths.has(path)) {
          invalidateMediaCache(path);
        }
      });
      setFolders(result);
      setFoldersLoaded(true);
      setFoldersDir(saveDirBase);
    } catch (err: any) {
      log.error(err);
      message.error(`读取目录失败：${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [
    saveDirBase,
    message,
    setFolders,
    setFoldersLoaded,
    setFoldersDir,
    invalidateMediaCache,
  ]);

  // 进入某个子文件夹：只有目录有变化或明确刷新时才重新扫描
  const openFolder = useCallback(
    async (folder: GalleryFolder, force = false) => {
      const token = ++openFolderTokenRef.current;
      setCurrentFolder(folder);
      resetVisibleCount();
      const cached = mediaCache[folder.path];
      // 命中缓存（含空目录缓存）时直接复用
      if (!force && cached) {
        setMedias(cached);
        return;
      }

      setLoading(true);
      setMedias([]);
      try {
        const entries = await fs.readDir(folder.path, { recursive: true });
        if (token !== openFolderTokenRef.current) return;
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
        // 仅在需要修改时间排序时才批量取 metadata，减少大文件夹阻塞
        let enriched = list.map((item) => ({
          ...item,
          modifiedAt: undefined as number | undefined,
        }));
        if (mediaSortBy === 'modifiedAt' && list.length > 0) {
          // 分批取 metadata，避免单次 IPC 过大
          const BATCH = 500;
          const modifiedMap = new Map<string, number | undefined>();
          for (let i = 0; i < list.length; i += BATCH) {
            if (token !== openFolderTokenRef.current) return;
            const batch = list.slice(i, i + BATCH);
            const fileMetadata = await invoke<
              { path: string; modifiedAt?: number }[]
            >('filesystem_metadata', {
              paths: batch.map((item) => item.path),
            });
            fileMetadata.forEach((item) =>
              modifiedMap.set(item.path, item.modifiedAt),
            );
          }
          enriched = list.map((item) => ({
            ...item,
            modifiedAt: modifiedMap.get(item.path),
          }));
        }
        if (token !== openFolderTokenRef.current) return;
        setMedias(enriched);
        setMediaCache(folder.path, enriched);
      } catch (err: any) {
        if (token !== openFolderTokenRef.current) return;
        log.error(err);
        message.error(`扫描文件失败：${err?.message || err}`);
      } finally {
        if (token === openFolderTokenRef.current) {
          setLoading(false);
        }
      }
    },
    [
      mediaCache,
      mediaSortBy,
      message,
      resetVisibleCount,
      setCurrentFolder,
      setMediaCache,
      setMedias,
    ],
  );

  // 默认不自动刷新：仅在从未扫描过、或保存路径发生变化时自动扫描一次。
  // 等持久化状态恢复完成后再判断，避免启动瞬间误判为「未扫描过」而重扫。
  useEffect(() => {
    if (!saveDirBase) return;
    let cancelled = false;
    (async () => {
      const persistApi = useGalleryStore.persist;
      if (!persistApi.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsub = persistApi.onFinishHydration(() => {
            unsub();
            resolve();
          });
        });
      }
      if (cancelled) return;
      const state = useGalleryStore.getState();
      if (!state.foldersLoaded || state.foldersDir !== saveDirBase) {
        await loadFolders();
      }
      // 如果有待打开的路径，扫描完成后自动打开对应文件夹
      if (state.pendingOpenPath && !cancelled) {
        const target = useGalleryStore
          .getState()
          .folders.find((f) => f.path === state.pendingOpenPath);
        if (target) {
          openFolder(target);
        }
        useGalleryStore.getState().setPendingOpenPath(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saveDirBase, loadFolders, openFolder]);

  const compareItems = useCallback(
    (
      a: { name: string; modifiedAt?: number },
      b: { name: string; modifiedAt?: number },
      sortBy: 'name' | 'modifiedAt',
    ) => {
      if (sortBy === 'modifiedAt') {
        return (a.modifiedAt || 0) - (b.modifiedAt || 0);
      }
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    },
    [],
  );
  const sortedFolders = useMemo(
    () =>
      [...folders].sort((a, b) => {
        const result = compareItems(a, b, folderSortBy);
        return folderSortOrder === 'asc' ? result : -result;
      }),
    [compareItems, folderSortBy, folderSortOrder, folders],
  );
  const sortedMedias = useMemo(
    () =>
      [...medias].sort((a, b) => {
        const result = compareItems(a, b, mediaSortBy);
        return mediaSortOrder === 'asc' ? result : -result;
      }),
    [compareItems, mediaSortBy, mediaSortOrder, medias],
  );
  const visibleMedias = sortedMedias.slice(0, visibleCount);

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
              onClick={() => openFolder(currentFolder, true)}
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
              <Segmented
                size="small"
                value={viewMode}
                onChange={(v) => setViewMode(v as 'thumbnail' | 'list')}
                options={[
                  { label: <AppstoreOutlined />, value: 'thumbnail' },
                  { label: <UnorderedListOutlined />, value: 'list' },
                ]}
              />
              {viewMode === 'thumbnail' && (
                <>
                  <span className="text-gray-400">每行</span>
                  <Segmented
                    size="small"
                    value={columns}
                    onChange={(v) => setColumns(v as number)}
                    options={COLUMN_OPTIONS}
                  />
                </>
              )}
              <Segmented
                size="small"
                value={fitMode}
                onChange={(v) => setFitMode(v as 'cover' | 'contain')}
                options={[
                  { label: '裁剪填充', value: 'cover' },
                  { label: '完整显示', value: 'contain' },
                ]}
              />
              <Segmented
                size="small"
                value={mediaSortBy}
                onChange={(v) => setMediaSortBy(v as 'name' | 'modifiedAt')}
                options={[
                  { label: '名称', value: 'name' },
                  { label: '修改时间', value: 'modifiedAt' },
                ]}
              />
              <Segmented
                size="small"
                value={mediaSortOrder}
                onChange={(v) => setMediaSortOrder(v as 'asc' | 'desc')}
                options={[
                  { label: '升序', value: 'asc' },
                  { label: '降序', value: 'desc' },
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
            <span className="ml-auto flex items-center gap-2 text-sm">
              <Segmented
                size="small"
                value={viewMode}
                onChange={(v) => setViewMode(v as 'thumbnail' | 'list')}
                options={[
                  { label: <AppstoreOutlined />, value: 'thumbnail' },
                  { label: <UnorderedListOutlined />, value: 'list' },
                ]}
              />
              {viewMode === 'thumbnail' && (
                <>
                  <span className="text-gray-400">每行</span>
                  <Segmented
                    size="small"
                    value={columns}
                    onChange={(v) => setColumns(v as number)}
                    options={COLUMN_OPTIONS}
                  />
                </>
              )}
              <Segmented
                size="small"
                value={folderSortBy}
                onChange={(v) => setFolderSortBy(v as 'name' | 'modifiedAt')}
                options={[
                  { label: '名称', value: 'name' },
                  { label: '修改时间', value: 'modifiedAt' },
                ]}
              />
              <Segmented
                size="small"
                value={folderSortOrder}
                onChange={(v) => setFolderSortOrder(v as 'asc' | 'desc')}
                options={[
                  { label: '升序', value: 'asc' },
                  { label: '降序', value: 'desc' },
                ]}
              />
            </span>
          </>
        )}
      </div>

      {!saveDirBase && (
        <Empty description="请先在「设置」中配置保存路径" className="mt-20" />
      )}

      {loading && (currentFolder || folders.length === 0) && (
        <div className="flex justify-center mt-20">
          <Spin tip="正在读取…" />
        </div>
      )}

      {/* 文件夹列表视图：后台增量校验时保留已展示的列表，不闪屏 */}
      {saveDirBase && !currentFolder && (!loading || folders.length > 0) && (
        <div className="grow overflow-auto pb-6">
          {folders.length === 0 ? (
            <Empty description="保存目录下暂无文件夹" className="mt-20" />
          ) : viewMode === 'list' ? (
            <div className="space-y-2">
              {sortedFolders.map((f) => (
                <button
                  key={f.path}
                  className="w-full flex items-center gap-3 p-3 bg-white border-[1px] rounded-lg text-left hover:border-ant-color-primary"
                  onClick={() => openFolder(f)}
                >
                  <FolderFilled className="text-xl text-ant-color-primary" />
                  <span className="grow truncate">{f.name}</span>
                  <span className="text-xs text-gray-400">
                    {f.modifiedAt
                      ? new Date(f.modifiedAt).toLocaleString()
                      : '修改时间未知'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div
              className={`grid ${COLUMN_CLASS[columns] || 'grid-cols-5'} gap-3`}
            >
              {sortedFolders.map((f) => (
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
              {viewMode === 'list' ? (
                <div className="space-y-2">
                  {visibleMedias.map((m) => {
                    const src = tauri.convertFileSrc(m.path);
                    return (
                      <div
                        key={m.path}
                        className="flex items-center gap-3 p-2 bg-white border-[1px] rounded-lg"
                      >
                        <div className="w-16 h-16 rounded overflow-hidden bg-[#F0EEE6] shrink-0">
                          {m.isVideo ? (
                            <VideoTile
                              name={m.name}
                              onPreview={() =>
                                setVideoPreview({
                                  src,
                                  title: m.name,
                                  path: m.path,
                                })
                              }
                            />
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
                        </div>
                        <span className="grow truncate select-text">
                          {m.name}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {m.modifiedAt
                            ? new Date(m.modifiedAt).toLocaleString()
                            : ''}
                        </span>
                        <Button size="small" onClick={() => shell.open(m.path)}>
                          打开
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Image.PreviewGroup
                  preview={{
                    toolbarRender: (
                      _,
                      {
                        actions: {
                          onFlipY,
                          onFlipX,
                          onRotateLeft,
                          onRotateRight,
                          onZoomOut,
                          onZoomIn,
                        },
                        current,
                      },
                    ) => {
                      const currentMedia = visibleMedias[current];
                      return (
                        <div className="flex gap-2 items-center">
                          <Button
                            size="small"
                            icon={<FolderOpenOutlined />}
                            title="用默认程序打开"
                            onClick={() => {
                              if (currentMedia) shell.open(currentMedia.path);
                            }}
                          />
                          <Button
                            size="small"
                            icon={<VerticalAlignTopOutlined />}
                            title="垂直翻转"
                            onClick={onFlipY}
                          />
                          <Button
                            size="small"
                            icon={<SwapOutlined />}
                            title="水平翻转"
                            onClick={onFlipX}
                          />
                          <Button
                            size="small"
                            icon={<RotateLeftOutlined />}
                            title="左转"
                            onClick={onRotateLeft}
                          />
                          <Button
                            size="small"
                            icon={<RotateRightOutlined />}
                            title="右转"
                            onClick={onRotateRight}
                          />
                          <Button
                            size="small"
                            icon={<ZoomOutOutlined />}
                            title="缩小"
                            onClick={onZoomOut}
                          />
                          <Button
                            size="small"
                            icon={<ZoomInOutlined />}
                            title="放大"
                            onClick={onZoomIn}
                          />
                        </div>
                      );
                    },
                  }}
                >
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
                            <VideoTile
                              name={m.name}
                              onPreview={() =>
                                setVideoPreview({
                                  src,
                                  title: m.name,
                                  path: m.path,
                                })
                              }
                            />
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              shell.open(m.path);
                            }}
                            title="用默认程序打开"
                            className="absolute right-1 top-1 bg-black/70 hover:bg-black/90 text-white text-xs px-2 py-0.5 rounded transition-colors z-10"
                          >
                            打开
                          </button>
                          <span className="absolute left-1 bottom-1 right-1 truncate bg-black/60 text-white text-[10px] px-1 rounded pointer-events-none">
                            {m.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Image.PreviewGroup>
              )}
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
      <VideoPreviewModal
        open={!!videoPreview}
        src={videoPreview?.src}
        title={videoPreview?.title}
        filePath={videoPreview?.path}
        onClose={() => setVideoPreview(null)}
      />
    </div>
  );
};
