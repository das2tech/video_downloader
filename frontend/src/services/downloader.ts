import * as FileSystem from 'expo-file-system/legacy';

import { actions } from '../store/app-store';
import type { DownloadItem, VideoFormat } from '../types';

// Directory where all downloads live.
const DOWNLOAD_DIR = () => `${FileSystem.documentDirectory}downloads/`;

type LiveTask = {
  resumable: FileSystem.DownloadResumable;
  lastBytes: number;
  lastTs: number;
};

const live = new Map<string, LiveTask>();

async function ensureDir() {
  const dir = DOWNLOAD_DIR();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

function sanitize(name: string) {
  return name.replace(/[^\w\-. ]+/g, '_').slice(0, 80) || 'video';
}

function buildFileName(title: string, ext: string, id: string) {
  const safe = sanitize(title);
  const suffix = id.slice(0, 6);
  return `${safe}-${suffix}.${ext.replace(/^\./, '')}`;
}

function makeProgressCb(id: string) {
  return (data: FileSystem.DownloadProgressData) => {
    const task = live.get(id);
    const now = Date.now();
    const written = data.totalBytesWritten;
    let speed = 0;
    if (task) {
      const dt = Math.max(1, now - task.lastTs) / 1000;
      const db = Math.max(0, written - task.lastBytes);
      speed = db / dt;
      // Only push meaningful updates (every ~250ms)
      if (now - task.lastTs > 250 || speed === 0) {
        task.lastBytes = written;
        task.lastTs = now;
      }
    }
    actions.patchDownload(id, {
      bytes_written: written,
      size_bytes: data.totalBytesExpectedToWrite || undefined,
      speed_bps: speed,
      status: 'downloading',
    });
  };
}

export type StartOptions = {
  id: string;
  title: string;
  sourceUrl: string;
  format: VideoFormat;
};

export async function startDownload(opts: StartOptions): Promise<DownloadItem> {
  await ensureDir();
  const filename = buildFileName(opts.title, opts.format.ext, opts.id);
  const fileUri = `${DOWNLOAD_DIR()}${filename}`;

  const item: DownloadItem = {
    id: opts.id,
    title: opts.title,
    source_url: opts.sourceUrl,
    media_url: opts.format.url,
    ext: opts.format.ext,
    mime: opts.format.mime,
    kind: opts.format.kind,
    size_bytes: opts.format.size_bytes,
    bytes_written: 0,
    local_uri: null,
    status: 'downloading',
    created_at: Date.now(),
  };
  actions.upsertDownload(item);

  const resumable = FileSystem.createDownloadResumable(
    opts.format.url,
    fileUri,
    {},
    makeProgressCb(opts.id),
  );
  live.set(opts.id, { resumable, lastBytes: 0, lastTs: Date.now() });

  runResumable(opts.id, resumable, fileUri).catch(() => {
    // Failure already handled inside
  });

  return item;
}

async function runResumable(
  id: string,
  resumable: FileSystem.DownloadResumable,
  fileUri: string,
) {
  try {
    const result = await resumable.downloadAsync();
    if (result?.uri) {
      actions.patchDownload(id, {
        status: 'completed',
        local_uri: result.uri,
        completed_at: Date.now(),
        speed_bps: 0,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If it was cancelled/paused, don't mark as failed.
    if (!/paused|cancel/i.test(message)) {
      actions.patchDownload(id, {
        status: 'failed',
        error: message,
        speed_bps: 0,
      });
    }
    void fileUri;
  } finally {
    live.delete(id);
  }
}

export async function pauseDownload(id: string) {
  const task = live.get(id);
  if (!task) return;
  try {
    await task.resumable.pauseAsync();
    actions.patchDownload(id, { status: 'paused', speed_bps: 0 });
  } catch {
    /* noop */
  }
}

export async function resumeDownload(id: string) {
  const task = live.get(id);
  if (task) {
    task.lastTs = Date.now();
    actions.patchDownload(id, { status: 'downloading' });
    try {
      const result = await task.resumable.resumeAsync();
      if (result?.uri) {
        actions.patchDownload(id, {
          status: 'completed',
          local_uri: result.uri,
          completed_at: Date.now(),
          speed_bps: 0,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/paused|cancel/i.test(message)) {
        actions.patchDownload(id, { status: 'failed', error: message });
      }
    } finally {
      live.delete(id);
    }
    return;
  }
  // No live task (app was restarted). Caller should invoke retryDownload.
  actions.patchDownload(id, { status: 'paused' });
}

export async function cancelDownload(id: string) {
  const task = live.get(id);
  if (task) {
    try {
      await task.resumable.cancelAsync();
    } catch {
      /* noop */
    }
    live.delete(id);
  }
  actions.patchDownload(id, { status: 'cancelled', speed_bps: 0 });
}

export async function retryDownload(id: string, item: DownloadItem) {
  actions.patchDownload(id, {
    status: 'downloading',
    error: null,
    bytes_written: 0,
  });
  const resumable = FileSystem.createDownloadResumable(
    item.media_url,
    `${DOWNLOAD_DIR()}${buildFileName(item.title, item.ext, item.id)}`,
    {},
    makeProgressCb(id),
  );
  live.set(id, { resumable, lastBytes: 0, lastTs: Date.now() });
  runResumable(id, resumable, `${DOWNLOAD_DIR()}${buildFileName(item.title, item.ext, item.id)}`);
}

export async function deleteDownloadFile(item: DownloadItem) {
  if (item.local_uri) {
    try {
      await FileSystem.deleteAsync(item.local_uri, { idempotent: true });
    } catch {
      /* noop */
    }
  }
  actions.removeDownload(item.id);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bps: number | undefined): string {
  if (!bps || bps <= 0) return '';
  return `${formatBytes(bps)}/s`;
}

export function formatEta(bytesRemaining: number, bps: number | undefined): string {
  if (!bps || bps <= 0 || bytesRemaining <= 0) return '';
  const sec = Math.max(1, Math.round(bytesRemaining / bps));
  if (sec < 60) return `${sec}s left`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min < 60) return `${min}m ${s}s left`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m left`;
}
