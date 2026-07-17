import React from 'react';
import { Button, Modal } from 'antd';

export interface VideoPreviewModalProps {
  open: boolean;
  src?: string;
  title?: string;
  onClose: () => void;
}

export const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  open,
  src,
  title,
  onClose,
}) => (
  <Modal
    open={open}
    title={title || '视频预览'}
    centered
    width="min(960px, 90vw)"
    footer={<Button onClick={onClose}>关闭视频</Button>}
    onCancel={onClose}
    keyboard
    destroyOnClose
    maskClosable
  >
    {src && (
      <video
        key={src}
        src={src}
        controls
        autoPlay
        className="w-full max-h-[75vh] bg-black object-contain"
      />
    )}
  </Modal>
);
