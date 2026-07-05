export type VideoFormat = {
  id: string;
  label: string;
  ext: string;
  mime: string;
  size_bytes: number | null;
  url: string;
  kind: 'video' | 'audio';
};

export type AnalyzeResponse = {
  supported: boolean;
  reason?: string | null;
  title?: string | null;
  author?: string | null;
  duration_sec?: number | null;
  thumbnail?: string | null;
  mime?: string | null;
  size_bytes?: number | null;
  formats: VideoFormat[];
  source_url: string;
};

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DownloadItem = {
  id: string;
  title: string;
  source_url: string;
  media_url: string;
  ext: string;
  mime: string;
  kind: 'video' | 'audio';
  size_bytes: number | null;
  bytes_written: number;
  local_uri: string | null;
  status: DownloadStatus;
  error?: string | null;
  created_at: number;
  completed_at?: number | null;
  // Runtime-only (not persisted)
  speed_bps?: number;
};

export type HistoryEntry = {
  id: string;
  url: string;
  title: string;
  thumbnail?: string | null;
  resolution?: string | null;
  ext?: string | null;
  size_bytes?: number | null;
  created_at: number;
};

export type FavoriteEntry = {
  id: string;
  url: string;
  title: string;
  created_at: number;
};

export type Settings = {
  defaultResolution: 'original' | 'audio';
  defaultFormat: 'mp4' | 'm4a' | 'auto';
  maxParallelDownloads: number;
  wifiOnly: boolean;
  clipboardDetection: boolean;
  autoRetry: boolean;
};
