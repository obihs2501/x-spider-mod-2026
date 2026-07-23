/* eslint-disable react/prop-types */
import {
  DeleteOutlined,
  RedoOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { shell } from '@tauri-apps/api';
import { App, Avatar, Button, Drawer, Empty, List, Tooltip } from 'antd';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import {
  FailedPostRecord,
  useFailedPostsStore,
} from '../../stores/failed-posts';
import { useDownloadStore } from '../../stores/download';
import { getTweetDetail } from '../../twitter/api';
import { buildPostUrl } from '../../twitter/url';
import { delay } from '../../utils';

export const FailedPostsPanel: React.FC = () => {
  const { message } = App.useApp();
  const failures = useFailedPostsStore((s) => s.failures);
  const [open, setOpen] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const [retryingAll, setRetryingAll] = useState(false);

  if (failures.length === 0) return null;

  const retryOne = async (rec: FailedPostRecord) => {
    const post = await getTweetDetail(rec.postId);
    const medias = post.medias || [];
    if (medias.length === 0) {
      throw new Error('该帖子没有可下载的媒体');
    }
    await useDownloadStore
      .getState()
      .batchCreateDownloadTask(medias.map((media) => ({ post, media })));
    useFailedPostsStore.getState().removeFailure(rec.id);
  };

  const recordRetryError = (rec: FailedPostRecord, err: any) => {
    useFailedPostsStore.getState().addFailure({
      screenName: rec.screenName,
      userName: rec.userName,
      avatar: rec.avatar,
      postId: rec.postId,
      error: err?.message || String(err),
    });
  };

  const onRetryOne = async (rec: FailedPostRecord) => {
    setRetryingId(rec.id);
    try {
      await retryOne(rec);
      message.success('已重新创建下载任务');
    } catch (err: any) {
      log.error(err);
      recordRetryError(rec, err);
      message.error(`重试失败：${err?.message || '未知原因'}`);
    } finally {
      setRetryingId('');
    }
  };

  const onRetryAll = async () => {
    setRetryingAll(true);
    let okCount = 0;
    let failCount = 0;
    const snapshot = [...useFailedPostsStore.getState().failures];
    for (const rec of snapshot) {
      try {
        await retryOne(rec);
        okCount++;
      } catch (err: any) {
        log.error(err);
        recordRetryError(rec, err);
        failCount++;
      }
      await delay(800);
    }
    setRetryingAll(false);
    message.info(`重试完成：成功 ${okCount}，失败 ${failCount}`);
  };

  return (
    <>
      <div className="flex items-center justify-between bg-white border-[1px] border-red-200 rounded-md px-4 py-2 mb-3">
        <span className="text-sm text-red-500 flex items-center gap-2">
          <WarningOutlined />
          {`${failures.length} 条推文处理失败，可重试`}
        </span>
        <Button size="small" onClick={() => setOpen(true)}>
          查看失败队列
        </Button>
      </div>
      <Drawer
        title={`失败推文队列（${failures.length}）`}
        open={open}
        onClose={() => setOpen(false)}
        width={560}
        extra={
          <div className="space-x-2">
            <Button
              size="small"
              icon={<RedoOutlined />}
              loading={retryingAll}
              onClick={onRetryAll}
            >
              全部重试
            </Button>
            <Button
              size="small"
              danger
              disabled={retryingAll}
              onClick={() => useFailedPostsStore.getState().clear()}
            >
              清空
            </Button>
          </div>
        }
      >
        {failures.length === 0 ? (
          <Empty description="暂无失败记录" />
        ) : (
          <List
            dataSource={failures}
            renderItem={(rec) => (
              <List.Item
                actions={[
                  <Button
                    key="retry"
                    size="small"
                    icon={<RedoOutlined />}
                    loading={retryingId === rec.id}
                    disabled={retryingAll}
                    onClick={() => onRetryOne(rec)}
                  >
                    重试
                  </Button>,
                  <Button
                    key="del"
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={retryingAll}
                    onClick={() =>
                      useFailedPostsStore.getState().removeFailure(rec.id)
                    }
                    title="从队列移除"
                  />,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar src={rec.avatar} size={32}>
                      {rec.screenName[0]?.toUpperCase()}
                    </Avatar>
                  }
                  title={
                    <button
                      className="bg-transparent hover:text-ant-color-primary transition-colors"
                      onClick={() =>
                        shell.open(buildPostUrl(rec.screenName, rec.postId))
                      }
                      title="打开推文网页"
                    >
                      {`${rec.userName || rec.screenName} @${rec.screenName}`}
                    </button>
                  }
                  description={
                    <Tooltip title={rec.error}>
                      <span className="text-xs block overflow-hidden text-ellipsis whitespace-nowrap max-w-[300px]">
                        {`${dayjs(rec.createdAt).format('MM-DD HH:mm')} · ${rec.error}`}
                      </span>
                    </Tooltip>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </>
  );
};
