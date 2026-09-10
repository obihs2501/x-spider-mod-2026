/* eslint-disable react/prop-types */
import {
  AppstoreOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  CheckOutlined,
  ColumnWidthOutlined,
  FolderFilled,
  FolderOpenOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  VerticalRightOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Empty, Input, Tooltip } from 'antd';
import clsx from 'clsx';
import React, { useMemo, useState } from 'react';
import { BloggerGroup } from '../../stores/bloggers';
import { GalleryFolder, useGalleryStore } from '../../stores/gallery';
import { formatRelativeDate } from '../../utils/gallery-media';
import { GalleryFolderItem } from './types';

export interface FolderSidebarProps {
  /** 已按搜索词过滤、按排序设置排好序的列表 */
  items: GalleryFolderItem[];
  totalCount: number;
  groups: BloggerGroup[];
  selectedPath?: string;
  loading: boolean;
  onSelect: (folder: GalleryFolder) => void;
  onRefresh: () => void;
  onOpenRoot: () => void;
}

const FolderRow: React.FC<{
  item: GalleryFolderItem;
  selected: boolean;
  onSelect: (folder: GalleryFolder) => void;
}> = ({ item, selected, onSelect }) => (
  <button
    className={clsx(
      'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors',
      selected
        ? 'bg-ant-color-primary-bg text-ant-color-primary'
        : 'bg-transparent hover:bg-ant-color-fill-tertiary',
    )}
    onClick={() => onSelect(item.folder)}
    title={item.folder.name}
  >
    {item.avatar ? (
      <Avatar src={item.avatar} size={32} className="shrink-0" />
    ) : (
      <span className="w-8 h-8 rounded-full bg-ant-color-fill-secondary flex items-center justify-center shrink-0">
        <FolderFilled className="text-ant-color-primary" />
      </span>
    )}
    <span className="min-w-0 flex-1">
      <span
        className={clsx(
          'block truncate text-sm',
          selected ? 'font-semibold' : 'text-ant-color-text',
        )}
      >
        {item.displayName}
      </span>
      <span className="block truncate text-xs text-ant-color-text-tertiary">
        {item.screenName
          ? `@${item.screenName}`
          : formatRelativeDate(item.folder.modifiedAt) || '文件夹'}
      </span>
    </span>
    {item.count !== undefined && (
      <span className="text-xs text-ant-color-text-tertiary shrink-0 tabular-nums">
        {item.count}
      </span>
    )}
  </button>
);

const SectionHeader: React.FC<{
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}> = ({ title, count, collapsed, onToggle }) => (
  <button
    className="w-full flex items-center gap-1.5 px-2 py-1 mt-1 text-xs text-ant-color-text-secondary bg-transparent hover:text-ant-color-primary transition-colors"
    onClick={onToggle}
  >
    {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
    <span className="font-semibold truncate">{title}</span>
    <span className="text-ant-color-text-tertiary">({count})</span>
  </button>
);

export const FolderSidebar: React.FC<FolderSidebarProps> = ({
  items,
  totalCount,
  groups,
  selectedPath,
  loading,
  onSelect,
  onRefresh,
  onOpenRoot,
}) => {
  const {
    folderSearch,
    setFolderSearch,
    folderSortBy,
    setFolderSortBy,
    folderSortOrder,
    setFolderSortOrder,
    groupByBlogger,
    setGroupByBlogger,
    sidebarCollapsed,
    setSidebarCollapsed,
    contentCollapsed,
    setContentCollapsed,
  } = useGalleryStore((s) => ({
    folderSearch: s.folderSearch,
    setFolderSearch: s.setFolderSearch,
    folderSortBy: s.folderSortBy,
    setFolderSortBy: s.setFolderSortBy,
    folderSortOrder: s.folderSortOrder,
    setFolderSortOrder: s.setFolderSortOrder,
    groupByBlogger: s.groupByBlogger,
    setGroupByBlogger: s.setGroupByBlogger,
    sidebarCollapsed: s.sidebarCollapsed,
    setSidebarCollapsed: s.setSidebarCollapsed,
    contentCollapsed: s.contentCollapsed,
    setContentCollapsed: s.setContentCollapsed,
  }));
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const sections = useMemo(() => {
    if (!groupByBlogger) return null;
    const byGroup = new Map<string, GalleryFolderItem[]>();
    const ungrouped: GalleryFolderItem[] = [];
    const others: GalleryFolderItem[] = [];
    for (const item of items) {
      if (!item.screenName) {
        others.push(item);
      } else if (item.groupId && groups.some((g) => g.id === item.groupId)) {
        const list = byGroup.get(item.groupId) || [];
        list.push(item);
        byGroup.set(item.groupId, list);
      } else {
        ungrouped.push(item);
      }
    }
    const result: { key: string; title: string; items: GalleryFolderItem[] }[] =
      [];
    for (const g of groups) {
      const list = byGroup.get(g.id);
      if (list?.length) result.push({ key: g.id, title: g.name, items: list });
    }
    if (ungrouped.length) {
      result.push({ key: '__ungrouped', title: '未分组', items: ungrouped });
    }
    if (others.length) {
      result.push({ key: '__others', title: '其他文件夹', items: others });
    }
    return result;
  }, [groupByBlogger, groups, items]);

  if (sidebarCollapsed && !contentCollapsed) {
    return (
      <aside className="shrink-0 w-10 flex flex-col items-center pt-1 gap-2 border-r border-ant-color-border-secondary mr-3">
        <Tooltip title="展开文件夹列表" placement="right">
          <Button
            type="text"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setSidebarCollapsed(false)}
          />
        </Tooltip>
        <Tooltip title="刷新文件夹列表" placement="right">
          <Button
            type="text"
            icon={<ReloadOutlined spin={loading} />}
            onClick={onRefresh}
          />
        </Tooltip>
      </aside>
    );
  }

  const sortMenuItems = [
    {
      key: 'by:modifiedAt',
      label: '按修改时间',
      icon: folderSortBy === 'modifiedAt' ? <CheckOutlined /> : <span />,
    },
    {
      key: 'by:name',
      label: '按名称',
      icon: folderSortBy === 'name' ? <CheckOutlined /> : <span />,
    },
    { type: 'divider' as const },
    {
      key: 'order:desc',
      label: folderSortBy === 'name' ? '降序（Z → A）' : '最近的在前',
      icon: folderSortOrder === 'desc' ? <CheckOutlined /> : <span />,
    },
    {
      key: 'order:asc',
      label: folderSortBy === 'name' ? '升序（A → Z）' : '最早的在前',
      icon: folderSortOrder === 'asc' ? <CheckOutlined /> : <span />,
    },
  ];

  const renderRows = (list: GalleryFolderItem[]) => {
    const rows = list.map((item) => (
      <FolderRow
        key={item.folder.path}
        item={item}
        selected={item.folder.path === selectedPath}
        onSelect={onSelect}
      />
    ));
    // 内容区收起时列表铺满整页，按多列网格排布以一屏看到更多博主
    return contentCollapsed ? (
      <div className="grid gap-x-3 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
        {rows}
      </div>
    ) : (
      rows
    );
  };

  return (
    <aside
      className={clsx(
        'shrink-0 flex flex-col min-h-0',
        contentCollapsed
          ? 'w-full'
          : 'w-64 border-r border-ant-color-border-secondary pr-3 mr-3',
      )}
    >
      <div className="flex items-center gap-1 mb-2">
        <span className="font-bold text-base flex-1 truncate">
          文件夹
          <span className="ml-1 text-xs font-normal text-ant-color-text-tertiary">
            {folderSearch ? `${items.length} / ${totalCount}` : totalCount}
          </span>
        </span>
        <Tooltip title="刷新文件夹列表">
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined spin={loading} />}
            onClick={onRefresh}
          />
        </Tooltip>
        <Tooltip title="打开保存根目录">
          <Button
            type="text"
            size="small"
            icon={<FolderOpenOutlined />}
            onClick={onOpenRoot}
          />
        </Tooltip>
        <Tooltip title={groupByBlogger ? '取消按分组显示' : '按博主分组显示'}>
          <Button
            type={groupByBlogger ? 'primary' : 'text'}
            ghost={groupByBlogger}
            size="small"
            icon={<AppstoreOutlined />}
            onClick={() => setGroupByBlogger(!groupByBlogger)}
          />
        </Tooltip>
        <Dropdown
          trigger={['click']}
          menu={{
            items: sortMenuItems,
            onClick: ({ key }) => {
              if (key === 'by:name' || key === 'by:modifiedAt') {
                setFolderSortBy(key.slice(3) as 'name' | 'modifiedAt');
              } else if (key === 'order:asc' || key === 'order:desc') {
                setFolderSortOrder(key.slice(6) as 'asc' | 'desc');
              }
            },
          }}
        >
          <Tooltip title="排序">
            <Button type="text" size="small" icon={<SortAscendingOutlined />} />
          </Tooltip>
        </Dropdown>
        <Tooltip
          title={
            contentCollapsed
              ? '展开右侧内容区'
              : '收起右侧内容区，列表铺满整页方便找博主'
          }
        >
          <Button
            type={contentCollapsed ? 'primary' : 'text'}
            ghost={contentCollapsed}
            size="small"
            icon={
              contentCollapsed ? (
                <ColumnWidthOutlined />
              ) : (
                <VerticalRightOutlined />
              )
            }
            onClick={() => setContentCollapsed(!contentCollapsed)}
          />
        </Tooltip>
        {!contentCollapsed && (
          <Tooltip title="收起文件夹列表">
            <Button
              type="text"
              size="small"
              icon={<MenuFoldOutlined />}
              onClick={() => setSidebarCollapsed(true)}
            />
          </Tooltip>
        )}
      </div>
      <Input
        size="small"
        allowClear
        prefix={<SearchOutlined className="text-ant-color-text-quaternary" />}
        placeholder="搜索博主 / 文件夹"
        value={folderSearch}
        onChange={(e) => setFolderSearch(e.target.value)}
        className="mb-2"
      />
      <div className="flex-1 min-h-0 overflow-y-auto -mr-1 pr-1 pb-4">
        {items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              totalCount === 0 ? '保存目录下暂无文件夹' : '没有匹配的文件夹'
            }
            className="mt-10"
          />
        ) : sections ? (
          sections.map((section) => (
            <div key={section.key}>
              <SectionHeader
                title={section.title}
                count={section.items.length}
                collapsed={collapsedSections.has(section.key)}
                onToggle={() => toggleSection(section.key)}
              />
              {!collapsedSections.has(section.key) && renderRows(section.items)}
            </div>
          ))
        ) : (
          renderRows(items)
        )}
      </div>
    </aside>
  );
};
