import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type {
  DownloadItem,
  FavoriteEntry,
  HistoryEntry,
  Settings,
} from '../types';

type StoreState = {
  recentUrls: string[];
  history: HistoryEntry[];
  favorites: FavoriteEntry[];
  downloads: DownloadItem[];
  settings: Settings;
  hydrated: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  defaultResolution: 'original',
  defaultFormat: 'auto',
  maxParallelDownloads: 3,
  wifiOnly: false,
  clipboardDetection: true,
  autoRetry: true,
};

const KEY = '@video_downloader/state_v1';

const state: StoreState = {
  recentUrls: [],
  history: [],
  favorites: [],
  downloads: [],
  settings: { ...DEFAULT_SETTINGS },
  hydrated: false,
};

const listeners = new Set<() => void>();
let snapshot: StoreState = { ...state };

function emit() {
  snapshot = {
    recentUrls: [...state.recentUrls],
    history: [...state.history],
    favorites: [...state.favorites],
    downloads: [...state.downloads],
    settings: { ...state.settings },
    hydrated: state.hydrated,
  };
  listeners.forEach((l) => l());
}

async function persist() {
  const payload = {
    recentUrls: state.recentUrls,
    history: state.history,
    favorites: state.favorites,
    // strip runtime-only fields
    downloads: state.downloads.map((d) => ({ ...d, speed_bps: undefined })),
    settings: state.settings,
  };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export async function hydrateStore() {
  if (state.hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.recentUrls = parsed.recentUrls ?? [];
      state.history = parsed.history ?? [];
      state.favorites = parsed.favorites ?? [];
      state.downloads = (parsed.downloads ?? []).map((d: DownloadItem) => {
        // If it was mid-download when the app closed, mark paused.
        if (d.status === 'downloading') {
          return { ...d, status: 'paused' as const };
        }
        return d;
      });
      state.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    }
  } catch {
    // ignore
  }
  state.hydrated = true;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return snapshot;
}

export function useAppStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ---------- Actions ----------

export const actions = {
  addRecentUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    state.recentUrls = [trimmed, ...state.recentUrls.filter((u) => u !== trimmed)].slice(0, 20);
    emit();
    persist();
  },
  clearRecentUrls() {
    state.recentUrls = [];
    emit();
    persist();
  },

  addHistory(entry: HistoryEntry) {
    state.history = [entry, ...state.history.filter((h) => h.id !== entry.id)].slice(0, 500);
    emit();
    persist();
  },
  removeHistory(id: string) {
    state.history = state.history.filter((h) => h.id !== id);
    emit();
    persist();
  },
  clearHistory() {
    state.history = [];
    emit();
    persist();
  },

  addFavorite(entry: FavoriteEntry) {
    state.favorites = [entry, ...state.favorites.filter((f) => f.url !== entry.url)];
    emit();
    persist();
  },
  removeFavorite(id: string) {
    state.favorites = state.favorites.filter((f) => f.id !== id);
    emit();
    persist();
  },
  toggleFavorite(entry: FavoriteEntry) {
    const exists = state.favorites.find((f) => f.url === entry.url);
    if (exists) {
      state.favorites = state.favorites.filter((f) => f.id !== exists.id);
    } else {
      state.favorites = [entry, ...state.favorites];
    }
    emit();
    persist();
  },
  isFavorite(url: string) {
    return state.favorites.some((f) => f.url === url);
  },

  upsertDownload(item: DownloadItem) {
    const idx = state.downloads.findIndex((d) => d.id === item.id);
    if (idx === -1) {
      state.downloads = [item, ...state.downloads];
    } else {
      state.downloads = [
        ...state.downloads.slice(0, idx),
        { ...state.downloads[idx], ...item },
        ...state.downloads.slice(idx + 1),
      ];
    }
    emit();
    persist();
  },
  patchDownload(id: string, patch: Partial<DownloadItem>) {
    const idx = state.downloads.findIndex((d) => d.id === id);
    if (idx === -1) return;
    state.downloads = [
      ...state.downloads.slice(0, idx),
      { ...state.downloads[idx], ...patch },
      ...state.downloads.slice(idx + 1),
    ];
    emit();
    // Skip persist for high-frequency progress updates
    if (patch.status || patch.completed_at || patch.local_uri || patch.error) {
      persist();
    }
  },
  removeDownload(id: string) {
    state.downloads = state.downloads.filter((d) => d.id !== id);
    emit();
    persist();
  },
  clearCompletedDownloads() {
    state.downloads = state.downloads.filter((d) => d.status !== 'completed');
    emit();
    persist();
  },

  updateSettings(patch: Partial<Settings>) {
    state.settings = { ...state.settings, ...patch };
    emit();
    persist();
  },
};

export function useHydrate() {
  const store = useAppStore();
  useEffect(() => {
    if (!store.hydrated) hydrateStore();
  }, [store.hydrated]);
  return store.hydrated;
}

// Convenience selector hook
export function useIsFavorite(url: string | null | undefined) {
  const store = useAppStore();
  return useCallback(() => (url ? store.favorites.some((f) => f.url === url) : false), [
    store.favorites,
    url,
  ])();
}
