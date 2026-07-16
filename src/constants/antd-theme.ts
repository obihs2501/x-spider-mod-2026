import { ThemeConfig } from 'antd';

/**
 * Claude 风格主题：
 * 奶油纸色背景 + 赤陶橙主色 + 暖灰墨色文字 + 柔和大圆角
 */
export const CLAUDE_COLORS = {
  primary: '#C96442', // 赤陶橙（terracotta）
  primaryHover: '#D97757',
  bgBase: '#FAF9F5', // 奶油纸色
  bgSecondary: '#F0EEE6', // 稍深的暖灰底
  text: '#3D3929', // 暖墨色
  textSecondary: '#87867F',
  border: '#E8E6DC',
};

export const ANTD_THEME: ThemeConfig = {
  token: {
    colorPrimary: CLAUDE_COLORS.primary,
    colorInfo: CLAUDE_COLORS.primary,
    colorLink: CLAUDE_COLORS.primary,
    colorBgBase: '#FFFFFF',
    colorBgLayout: CLAUDE_COLORS.bgBase,
    colorTextBase: CLAUDE_COLORS.text,
    colorBorder: CLAUDE_COLORS.border,
    colorBorderSecondary: CLAUDE_COLORS.border,
    borderRadius: 10,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
  cssVar: true,
  hashed: false,
};
