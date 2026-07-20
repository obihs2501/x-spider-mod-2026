import { fs, path } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/tauri';

let blog: ICategoriedLogger;
function log() {
  if (!blog) blog = window.log.category('BLOGGER-DIR');
  return blog;
}

// 会话级缓存：`${saveDirBase}|${screenName 小写}` → 实际使用的博主文件夹名
const resolvedDirCache = new Map<string, string>();

export function clearBloggerDirCache() {
  resolvedDirCache.clear();
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    await fs.readDir(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 博主改名后，按模板解析出的文件夹名会跟着变，导致同一博主被分散到多个文件夹。
 * 这里按文件夹名里的「(@screenName)」标记在保存目录下寻找该博主已有的文件夹并沿用；
 * 存在多个旧文件夹时选择最近有写入的那个。模板不含 @screenName 时保持原样。
 */
export async function resolveBloggerDirName(
  saveDirBase: string,
  screenName: string,
  desiredDirName: string,
): Promise<string> {
  if (!saveDirBase || !screenName) return desiredDirName;

  // 模板可能包含子目录，只对第一层（博主层）做识别
  const sepMatch = desiredDirName.match(/[\\/]/);
  const first = sepMatch
    ? desiredDirName.slice(0, sepMatch.index)
    : desiredDirName;
  const rest = sepMatch ? desiredDirName.slice(sepMatch.index!) : '';

  const marker = `(@${screenName})`.toLowerCase();
  if (!first.toLowerCase().includes(marker)) return desiredDirName;

  const cacheKey = `${saveDirBase}|${screenName.toLowerCase()}`;
  const cached = resolvedDirCache.get(cacheKey);
  if (cached) return cached + rest;

  let resolved = first;
  try {
    if (await fs.exists(await path.join(saveDirBase, first))) {
      // 当前名字的文件夹已存在，直接使用
      resolved = first;
    } else if (await fs.exists(saveDirBase)) {
      const entries = await fs.readDir(saveDirBase);
      const candidates: fs.FileEntry[] = [];
      for (const entry of entries) {
        if (!entry.name) continue;
        if (!entry.name.toLowerCase().includes(marker)) continue;
        if (await isDirectory(entry.path)) candidates.push(entry);
      }
      if (candidates.length === 1) {
        resolved = candidates[0].name!;
      } else if (candidates.length > 1) {
        const metadata = await invoke<{ path: string; modifiedAt?: number }[]>(
          'filesystem_metadata',
          { paths: candidates.map((c) => c.path) },
        );
        const modifiedMap = new Map(
          metadata.map((m) => [m.path, m.modifiedAt || 0]),
        );
        candidates.sort(
          (a, b) =>
            (modifiedMap.get(b.path) || 0) - (modifiedMap.get(a.path) || 0),
        );
        resolved = candidates[0].name!;
      }
      if (resolved !== first) {
        log().info(
          `博主 @${screenName} 已改名，沿用已有文件夹「${resolved}」（模板解析为「${first}」）`,
        );
      }
    }
  } catch (err) {
    log().warn('resolveBloggerDirName failed, fallback to template dir', err);
    resolved = first;
  }

  resolvedDirCache.set(cacheKey, resolved);
  return resolved + rest;
}
