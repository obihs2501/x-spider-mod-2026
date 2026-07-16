export function buildPostUrl(screenName: string, postId: string) {
  return `https://twitter.com/${screenName}/status/${postId}`;
}

export function buildUserUrl(screenName: string) {
  return `https://twitter.com/${screenName}`;
}

/**
 * 从帖子链接中解析出 tweet ID 与用户名。
 * 支持 x.com / twitter.com / vxtwitter 等镜像域名，如：
 *   https://x.com/foo/status/1234567890
 *   https://twitter.com/foo/status/1234567890?s=20
 */
export function parsePostUrl(
  input: string,
): { screenName: string; postId: string } | null {
  const match = input
    .trim()
    .match(
      /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter|vxtwitter|fxtwitter|fixupx)\.com\/([A-Za-z0-9_]{1,20})\/status(?:es)?\/(\d+)/i,
    );
  if (!match) return null;
  return { screenName: match[1], postId: match[2] };
}
