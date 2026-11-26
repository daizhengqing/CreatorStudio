import { useEffect, useRef, useState, type FormEvent, type ClipboardEvent, type DragEvent } from 'react';
import {
  ArrowUp,
  FileAudio,
  FileImage,
  Film,
  LoaderCircle,
  Paperclip,
  Square,
  UploadCloud,
  X,
} from 'lucide-react';
import type { Asset } from '@creator-studio/contracts';
import { cn } from '@creator-studio/ui/utils';
import { formatBytes, formatDuration } from '../utils/format';

type Props = {
  draft: string;
  onDraft: (text: string) => void;
  assets: Asset[];
  onAttach: (files: File[]) => void;
  onRemove: (id: string) => void;
  uploading: boolean;
  sending: boolean;
  busy: boolean;
  stopping: boolean;
  error: string;
  onSend: () => void;
  onStop: () => void;
};

/**
 * 底部输入框组件
 * 支持自适应高度输入、剪贴板图片粘贴、文件拖拽上传和素材预览
 */
export function Composer({
  draft,
  onDraft,
  assets,
  onAttach,
  onRemove,
  uploading,
  sending,
  busy,
  stopping,
  error,
  onSend,
  onStop,
}: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  const canSend = Boolean(draft.trim() && !busy && !uploading && !sending);

  // 监听输入内容变化，自适应动态调整高度
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 42), 200);
    el.style.height = `${nextHeight}px`;
  }, [draft]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) onSend();
  }

  // 剪贴板粘贴文件监听（如截图或复制的音视频素材）
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = event.clipboardData.files;
    if (items.length > 0) {
      const files = Array.from(items);
      onAttach(files);
      // 若剪贴板中只有文件没有纯文本，阻止默认行为
      if (!event.clipboardData.getData('text/plain')) {
        event.preventDefault();
      }
    }
  }

  // 拖拽文件进入
  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragCounterRef.current += 1;
    if (event.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onAttach(files);
    }
  }

  return (
    <div className="composer-dock">
      <div
        className={cn('composer-card', {
          'is-dragging': isDraggingOver,
        })}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 拖拽释放提示蒙层 */}
        {isDraggingOver && (
          <div className="composer-drop-overlay">
            <UploadCloud size={28} className="animate-bounce text-foreground" />
            <span className="text-sm font-medium">释放鼠标以上传素材文件</span>
          </div>
        )}

        {/* 附件富媒体展示列表 */}
        {(assets.length > 0 || uploading) && (
          <div className="composer-attachments">
            {assets.map(asset => {
              const isImage = asset.type === 'image';
              const isVideo = asset.type === 'video';
              const isAudio = asset.type === 'audio';

              return (
                <div key={asset.id} className="attachment-rich-chip" title={asset.name}>
                  {/* 缩略图或类型图标 */}
                  <div className="attachment-thumb">
                    {isImage ? (
                      <img src={asset.streamUrl} alt={asset.name} className="attachment-img" />
                    ) : isVideo ? (
                      <Film size={14} className="text-muted-foreground" />
                    ) : isAudio ? (
                      <FileAudio size={14} className="text-muted-foreground" />
                    ) : (
                      <FileImage size={14} className="text-muted-foreground" />
                    )}
                  </div>

                  {/* 标题与媒体信息 */}
                  <div className="attachment-info">
                    <span className="attachment-name truncate">{asset.name}</span>
                    <span className="attachment-meta">
                      {formatBytes(asset.size)}
                      {asset.duration ? ` · ${formatDuration(asset.duration)}` : ''}
                    </span>
                  </div>

                  {/* 移除按钮 */}
                  <button
                    type="button"
                    className="attachment-remove-btn"
                    aria-label={`移除 ${asset.name}`}
                    onClick={() => onRemove(asset.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}

            {uploading && (
              <div className="attachment-rich-chip attachment-loading">
                <LoaderCircle size={14} className="animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">正在上传素材…</span>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="composer-form">
          {/* 自适应高度文本输入框 */}
          <textarea
            ref={textareaRef}
            maxLength={32000}
            value={draft}
            aria-label="创作需求描述"
            placeholder="描述你的需求，或截图粘贴、拖入视频/图片素材…"
            className="composer-textarea"
            onChange={event => onDraft(event.target.value)}
            onPaste={handlePaste}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSend) onSend();
              }
            }}
          />

          {/* 添加附件与发送或停止 */}
          <div className="composer-toolbar">
            <input
              ref={pickerRef}
              type="file"
              multiple
              hidden
              accept=".mp4,.mov,.webm,.mkv,.mp3,.wav,.m4a,.flac,.jpg,.jpeg,.png,.webp"
              onChange={event => {
                onAttach(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />

            <button
              type="button"
              className="composer-attach-btn"
              title="添加素材"
              aria-label="添加素材"
              disabled={uploading || assets.length >= 20}
              onClick={() => pickerRef.current?.click()}
            >
              <Paperclip size={17} />
            </button>

            {busy ? (
              <button
                type="button"
                className="composer-submit-btn busy"
                aria-label="停止运行"
                disabled={stopping}
                onClick={onStop}
              >
                {stopping ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Square size={14} />
                )}
              </button>
            ) : (
              <button
                type="submit"
                className="composer-submit-btn"
                aria-label="发送消息"
                disabled={!canSend}
              >
                {sending ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <ArrowUp size={16} />
                )}
              </button>
            )}
          </div>
        </form>
      </div>

      {error && (
        <p className="composer-error-tip" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
