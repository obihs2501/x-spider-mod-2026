/* eslint-disable react/prop-types */
import {
  CloseOutlined,
  CommentOutlined,
  DownloadOutlined,
  EyeOutlined,
  HeartOutlined,
  PlayCircleFilled,
  RetweetOutlined,
} from '@ant-design/icons';
import { fs, tauri } from '@tauri-apps/api';
import { Avatar, Button, Image, Tag } from 'antd';
import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import MediaType from '../../enums/MediaType';
import { TwitterPost } from '../../interfaces/TwitterPost';
import { useDownloadStore } from '../../stores/download';
import { buildPostUrl } from '../../twitter/url';
import { getDownloadUrl } from '../../twitter/utils';
import { buildLocalMediaPathMap } from '../../utils/local-media';
import { VideoPreviewModal } from '../media/VideoPreviewModal';

export interface PostPreviewProps {
  post: TwitterPost;
  downloading?: boolean;
  onDownload: () => void;
  onClose?: () => void;
}

/** 去掉推文末尾指向媒体的 t.co 短链 */
function cleanFullText(text?: string): string {
  if (!text) return '';
  return text.replace(/\s*https:\/\/t\.co\/\w+\s*$/g, '').trim();
}

function formatCount(n?: number): string {
  if (n === undefined || n === null) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

/**
 * 仿 X 界面的单条帖子预览卡片：展示头像、昵称、正文、媒体与互动数据。
 * 已下载的媒体优先加载本地文件；跳转 X 网页仅保留底部的显式链接。
 */
export const PostPreview: React.FC<PostPreviewProps> = ({
  post,
  downloading,
  onDownload,
  onClose,
}) => {
  const medias = post.medias || [];
  const text = cleanFullText(post.fullText);
  // media.id → 已验证存在的本地文件路径
  const [localPaths, setLocalPaths] = useState<Record<string, string>>({});
  const [videoPreview, setVideoPreview] = useState<{
    src: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = buildLocalMediaPathMap(
        useDownloadStore.getState().downloadTasks,
      );
      const result: Record<string, string> = {};
      for (const media of post.medias || []) {
        if (!media.id) continue;
        const p = map.get(media.id);
        if (p && (await fs.exists(p))) result[media.id] = p;
      }
      if (!cancelled) setLocalPaths(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [post]);

  return (
    <section
      aria-label="帖子预览"
      className="relative bg-white border-[1px] border-gray-300 rounded-xl mt-4 p-4 max-w-[600px]"
    >
      {onClose && (
        <Button
          type="text"
          size="small"
          aria-label="关闭预览"
          title="关闭预览"
          icon={<CloseOutlined />}
          onClick={onClose}
          className="!absolute right-2 top-2 z-10"
        />
      )}
      {/* 头部：头像 + 昵称 + 用户名（不再隐式跳转网页） */}
      <div className="flex items-center">
        <Avatar src={post.user.avatar} size={44} alt="头像" />
        <div className="ml-3 leading-tight">
          <p className="font-bold text-[15px]">
            {post.user.name || '未知用户'}
          </p>
          <p className="text-gray-500 text-sm">@{post.user.screenName}</p>
        </div>
      </div>

      {/* 正文（可选中复制） */}
      {text && (
        <p className="mt-3 text-[15px] whitespace-pre-wrap break-words select-text cursor-text">
          {text}
        </p>
      )}

      {/* 标签 */}
      {(post.tags?.length || 0) > 0 && (
        <div className="mt-2">
          {post.tags!.map((tag) => (
            <Tag key={tag} color="blue">
              #{tag}
            </Tag>
          ))}
        </div>
      )}

      {/* 媒体网格：图片点击放大（本地优先），视频点击应用内播放（本地优先） */}
      {medias.length > 0 && (
        <Image.PreviewGroup>
          <div
            className={clsx(
              'mt-3 grid gap-1 rounded-2xl overflow-hidden',
              medias.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
            )}
          >
            {medias.map((media, index) => {
              const localPath = media.id ? localPaths[media.id] : undefined;
              const localSrc = localPath
                ? tauri.convertFileSrc(localPath)
                : undefined;
              const posterSrc = `${media.url}?format=jpg&name=small`;
              return (
                <div key={media.id || index} className="relative">
                  {media.type === MediaType.Photo ? (
                    <Image
                      src={localSrc || posterSrc}
                      preview={{
                        src: localSrc || `${media.url}?format=jpg&name=orig`,
                      }}
                      alt={`媒体 p${index}`}
                      width="100%"
                      style={{
                        objectFit: 'cover',
                        maxHeight: 420,
                        width: '100%',
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="block w-full bg-transparent p-0"
                      title="播放视频"
                      onClick={() => {
                        try {
                          setVideoPreview({
                            src: localSrc || getDownloadUrl(media),
                            title: media.id || '视频预览',
                          });
                        } catch (err) {
                          log.error(err);
                        }
                      }}
                    >
                      <img
                        src={posterSrc}
                        alt={`媒体 p${index}`}
                        className="w-full object-cover"
                        style={{ maxHeight: 420 }}
                      />
                    </button>
                  )}
                  {media.type !== MediaType.Photo && (
                    <PlayCircleFilled className="absolute inset-0 m-auto w-fit h-fit text-white text-5xl drop-shadow-lg pointer-events-none" />
                  )}
                  {localPath && (
                    <span className="absolute right-1 top-1 bg-[rgba(82,196,26,0.9)] text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
                      已下载
                    </span>
                  )}
                  <span className="absolute left-1 bottom-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
                    p{index}
                    {media.type === MediaType.Video && ' · 视频'}
                    {media.type === MediaType.Gif && ' · GIF'}
                  </span>
                </div>
              );
            })}
          </div>
        </Image.PreviewGroup>
      )}

      {/* 时间 + 互动数据 */}
      <div className="mt-3 text-gray-500 text-sm flex flex-wrap gap-x-4 gap-y-1 items-center">
        {post.createdAt && (
          <span>{post.createdAt.format('YYYY-MM-DD HH:mm')}</span>
        )}
        {post.views !== undefined && (
          <span>
            <EyeOutlined /> {formatCount(post.views)}
          </span>
        )}
        <span>
          <CommentOutlined /> {formatCount(post.replyCount)}
        </span>
        <span>
          <RetweetOutlined /> {formatCount(post.retweetCount)}
        </span>
        <span>
          <HeartOutlined /> {formatCount(post.favoriteCount)}
        </span>
      </div>

      {/* 操作区 */}
      <div className="mt-4 flex items-center gap-3">
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          loading={downloading}
          disabled={medias.length === 0}
          onClick={onDownload}
        >
          {medias.length > 0
            ? `下载全部媒体（${medias.length}）`
            : '该帖子没有媒体'}
        </Button>
        <a
          href={buildPostUrl(post.user.screenName, post.id)}
          target="_blank"
          rel="noreferrer"
          className="text-sm"
        >
          在 X 上查看原帖
        </a>
      </div>
      <VideoPreviewModal
        open={!!videoPreview}
        src={videoPreview?.src}
        title={videoPreview?.title}
        onClose={() => setVideoPreview(null)}
      />
    </section>
  );
};
