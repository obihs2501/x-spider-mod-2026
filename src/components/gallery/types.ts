import { GalleryFolder } from '../../stores/gallery';

/** 左侧文件夹列表项：文件夹 + 关联到的博主信息 */
export interface GalleryFolderItem {
  folder: GalleryFolder;
  displayName: string;
  screenName?: string;
  avatar?: string;
  groupId?: string;
  /** 媒体数量（优先取本地索引的递归统计，其次取已扫描的本层数量） */
  count?: number;
}
