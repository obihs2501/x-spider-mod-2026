/* eslint-disable react/prop-types */
import { dialog } from '@tauri-apps/api';
import { Button, Select } from 'antd';
import * as R from 'ramda';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FixedSizeList, ListChildComponentProps, areEqual } from 'react-window';
import { DownloadTask } from '../../interfaces/DownloadTask';
import { useDownloadStore } from '../../stores/download';
import { CreationTasks } from './CreationTasks';
import { DownloadListItem } from './DownloadListItem';
import { useEventListener, useMount } from 'ahooks';

export interface DownloadListProps {
  filter: (task: DownloadTask) => boolean;
  sort?: (taskA: DownloadTask, taskB: DownloadTask) => number;
  onInScreenTasksChanged?: (tasks: DownloadTask[]) => void;
  batchActions?: ('pauseAll' | 'unpauseAll' | 'deleteAll' | 'redownloadAll')[];
}
const ITEM_CLIENT_HEIGHT = 144;
const ITEM_GAP = 16;

// 行组件必须定义在组件外并 memo：内联函数每次渲染都是新的组件类型，
// react-window 会把可见行整体卸载重建，悬停中的缩略图 hover 过渡被反复重放（表现为抖动）
const Row = React.memo(
  ({ index, style, data }: ListChildComponentProps<DownloadTask[]>) => (
    <div style={style}>
      <DownloadListItem
        itemClientHeight={ITEM_CLIENT_HEIGHT}
        itemGap={ITEM_GAP}
        task={data[index]}
      />
    </div>
  ),
  areEqual,
);
Row.displayName = 'DownloadListRow';

export const DownloadList: React.FC<DownloadListProps> = ({
  filter,
  sort,
  onInScreenTasksChanged,
  batchActions,
}) => {
  const {
    downloadTasks,
    pauseAllDownloadTask,
    unpauseAllDownloadTask,
    batchRemoveDownloadTasks,
    batchRedownloadTask,
  } = useDownloadStore((s) => ({
    downloadTasks: s.downloadTasks,
    pauseAllDownloadTask: s.pauseAllDownloadTask,
    unpauseAllDownloadTask: s.unpauseAllDownloadTask,
    batchRemoveDownloadTasks: s.batchRemoveDownloadTasks,
    batchRedownloadTask: s.batchRedownloadTask,
  }));
  const [listHeight, setListHeight] = useState(600);
  const [bloggerFilter, setBloggerFilter] = useState<string>('');
  const listRef = useRef<HTMLDivElement>(null);

  const updateListHeight = useCallback(() => {
    if (!listRef.current) return;
    setListHeight(listRef.current?.clientHeight);
  }, []);

  useMount(() => {
    updateListHeight();
  });

  useEventListener('resize', updateListHeight);

  const filterTasks = useCallback(
    R.pipe<[DownloadTask[]], DownloadTask[], DownloadTask[]>(
      R.filter(filter),
      sort ? R.sort(sort) : R.identity,
    ),
    [sort, filter],
  );

  const tasks = useMemo(() => {
    const filtered = filterTasks(downloadTasks);
    if (!bloggerFilter) return filtered;
    return filtered.filter((t) => t.post?.user?.screenName === bloggerFilter);
  }, [downloadTasks, filterTasks, bloggerFilter]);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // 当前分类下出现过的博主列表（用于筛选）
  const bloggers = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of filterTasks(downloadTasks)) {
      const sn = t.post?.user?.screenName;
      if (sn && !map.has(sn)) {
        map.set(sn, t.post?.user?.name || sn);
      }
    }
    return Array.from(map.entries()).map(([sn, name]) => ({
      value: sn,
      label: `${name} (@${sn})`,
    }));
  }, [downloadTasks, filterTasks]);

  const pauseAll = async () => {
    await pauseAllDownloadTask();
  };

  const unpauseAll = async () => {
    await unpauseAllDownloadTask();
  };

  const deleteAll = async () => {
    if (
      await dialog.confirm('确认要删除所有任务？\n已下载的文件不会被删除。', {
        okLabel: '确认',
        cancelLabel: '取消',
        title: '警告',
      })
    ) {
      const tasks = filterTasks(useDownloadStore.getState().downloadTasks);
      await batchRemoveDownloadTasks(tasks.map((t) => t.gid));
    }
  };

  const redownloadAll = async () => {
    if (
      await dialog.confirm('确认要重新下载全部任务？', {
        okLabel: '确认',
        cancelLabel: '取消',
        title: '警告',
      })
    ) {
      const tasks = filterTasks(useDownloadStore.getState().downloadTasks);
      await batchRedownloadTask(tasks.map((t) => t.gid));
    }
  };

  return (
    <div className="flex flex-col grow h-full overflow-hidden pb-4">
      <CreationTasks />
      <section className="flex items-center gap-3 flex-wrap py-2">
        <span>共 {tasksRef.current.length} 个下载任务。</span>
        <Select
          allowClear
          showSearch
          placeholder="按博主筛选"
          className="min-w-[220px]"
          size="small"
          value={bloggerFilter || undefined}
          onChange={(v) => setBloggerFilter(v || '')}
          options={bloggers}
          optionFilterProp="label"
        />
      </section>
      <ul className="flex space-x-2 mt-3 pb-2">
        {batchActions?.includes('unpauseAll') && (
          <li>
            <Button onClick={unpauseAll} disabled={tasks.length === 0}>
              全部开始
            </Button>
          </li>
        )}
        {batchActions?.includes('pauseAll') && (
          <li>
            <Button onClick={pauseAll} disabled={tasks.length === 0}>
              全部暂停
            </Button>
          </li>
        )}
        {batchActions?.includes('redownloadAll') && (
          <li>
            <Button onClick={redownloadAll} disabled={tasks.length === 0}>
              全部重下
            </Button>
          </li>
        )}
        {batchActions?.includes('deleteAll') && (
          <li>
            <Button onClick={deleteAll} disabled={tasks.length === 0} danger>
              全部删除
            </Button>
          </li>
        )}
      </ul>
      <div
        role="list"
        className="grow pr-4 overflow-hidden relative h-full mt-4"
        ref={listRef}
      >
        <FixedSizeList
          height={listHeight}
          itemCount={tasks.length}
          itemSize={ITEM_CLIENT_HEIGHT + ITEM_GAP}
          width={'100%'}
          itemData={tasks}
          itemKey={(index, data) => data[index].gid}
          onItemsRendered={({ visibleStartIndex, visibleStopIndex }) => {
            onInScreenTasksChanged?.(
              tasks.slice(visibleStartIndex, visibleStopIndex),
            );
          }}
        >
          {Row}
        </FixedSizeList>
      </div>
    </div>
  );
};
