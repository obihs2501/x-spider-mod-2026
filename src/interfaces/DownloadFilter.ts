import { Dayjs } from 'dayjs';
import MediaType from '../enums/MediaType';

/**
 * 下载源：
 * - medias / tweets：某个博主的媒体页 / 推文页
 * - search：高级搜索结果（searchQuery 为搜索语句）
 * - likes / bookmarks：登录账号的喜欢 / 书签
 */
export type DownloadSource =
  | 'medias'
  | 'tweets'
  | 'search'
  | 'likes'
  | 'bookmarks';

export interface DownloadFilter {
  dateRange?: [start: Dayjs, end: Dayjs];
  mediaTypes?: MediaType[];
  source: DownloadSource;
  /** 增量游标：扫到不晚于该推文 ID（雪花序比较）即停止翻页 */
  stopAtTweetId?: string;
  /** source 为 search 时的搜索语句（支持 X 高级搜索语法） */
  searchQuery?: string;
}
