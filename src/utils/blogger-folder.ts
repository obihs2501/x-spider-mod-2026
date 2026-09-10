/** 从文件夹名中提取博主，如「____Ncms (@ncmsncmsncms)」→ {name, screenName} */
export function parseBloggerFolder(
  folderName: string,
): { name: string; screenName: string } | null {
  const m = folderName.match(/^(.*?)\s*\(@([A-Za-z0-9_]{1,20})\)\s*$/);
  if (!m) return null;
  return { name: m[1].trim() || m[2], screenName: m[2] };
}
