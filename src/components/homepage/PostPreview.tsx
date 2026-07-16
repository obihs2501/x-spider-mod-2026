/* eslint-disable react/prop-types */
import {
  CommentOutlined,
  DownloadOutlined,
  EyeOutlined,
  HeartOutlined,
  PlayCircleFilled,
  RetweetOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Tag } from 'antd';
import clsx from 'clsx';
import React from 'react';
import MediaType from '../../enums/MediaType';
import { TwitterPost } from '../../interfaces/TwitterPost';
import { buildPostUrl, buildUserUrl } from '../../twitter/url';

export interface PostPreviewProps {
  post: TwitterPost;
  downloading?: boolean;
  onDownload: () => void;
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
 * 纯文字帖子也可展示；媒体下载由用户点击按钮手动触发。
 */
export const PostPreview: React.FC<PostPreviewProps> = ({
  post,
  downloading,
  onDownload,
}) => {
  const medias = post.medias || [];
  const text = cleanFullText(post.fullText);

  return (
    <section
      aria-label="帖子预览"
      className="bg-white border-[1px] border-gray-300 rounded-xl mt-4 p-4 max-w-[600px]"
    >
      {/* 头部：头像 + 昵称 + 用户名 */}
      <a
        className="flex items-center"
        href={
          post.user.screenName
            ? buildUserUrl(post.user.screenName)
            : 'javascript:void(0);'
        }
        target="_blank"
        rel="noreferrer"
        title="跳转到用户主页"
      >
        <Avatar src={post.user.avatar} size={44} alt="头像" />
        <div className="ml-3 leading-tight">
          <p className="font-bold text-[15px]">{post.user.name || '未知用户'}</p>
          <p className="text-gray-500 text-sm">@{post.user.screenName}</p>
        </div>
      </a>

      {/* 正文 */}
      {text && (
        <p className="mt-3 text-[15px] whitespace-pre-wrap break-words">
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

      {/* 媒体网格 */}
      {medias.length > 0 && (
        <div
          className={clsx(
            'mt-3 grid gap-1 rounded-2xl overflow-hidden',
            medias.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {medias.map((media, index) => (
            <div key={media.id || index} className="relative">
              <img
                src={`${media.url}?format=jpg&name=small`}
                alt={`媒体 p${index}`}
                className="w-full h-full object-cover max-h-[420px]"
              />
              {media.type !== MediaType.Photo && (
                <PlayCircleFilled className="absolute inset-0 m-auto w-fit h-fit text-white text-5xl drop-shadow-lg" />
              )}
              <span className="absolute left-1 bottom-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                p{index}
                {media.type === MediaType.Video && ' · 视频'}
                {media.type === MediaType.Gif && ' · GIF'}
              </span>
            </div>
          ))}
        </div>
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
    </section>
  );
};
