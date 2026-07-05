import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import EmptyState from '@/src/components/EmptyState';
import {
  cancelDownload,
  deleteDownloadFile,
  formatBytes,
  formatEta,
  formatSpeed,
  pauseDownload,
  resumeDownload,
  retryDownload,
} from '@/src/services/downloader';
import { useAppStore } from '@/src/store/app-store';
import { colors, fontSize, radius, spacing } from '@/src/theme/tokens';
import type { DownloadItem } from '@/src/types';

type Filter = 'all' | 'active' | 'completed' | 'failed';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

export default function DownloadsScreen() {
  const store = useAppStore();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    let items = store.downloads;
    if (filter === 'active') {
      items = items.filter((d) => d.status === 'downloading' || d.status === 'paused' || d.status === 'queued');
    } else if (filter === 'completed') {
      items = items.filter((d) => d.status === 'completed');
    } else if (filter === 'failed') {
      items = items.filter((d) => d.status === 'failed' || d.status === 'cancelled');
    }
    const query = q.trim().toLowerCase();
    if (query) items = items.filter((d) => d.title.toLowerCase().includes(query));
    return items;
  }, [store.downloads, filter, q]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="downloads-screen">
      {/* Sticky header */}
      <View style={styles.header}>
        <Text style={styles.title}>Downloads</Text>
        <Text style={styles.subtitle}>{store.downloads.length} total</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search downloads"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          testID="downloads-search-input"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} testID="downloads-search-clear">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chipsWrap}>
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(f) => f.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          renderItem={({ item }) => {
            const active = filter === item.id;
            return (
              <Pressable
                onPress={() => setFilter(item.id)}
                testID={`downloads-filter-${item.id}`}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {list.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="cloud-offline-outline"
            title="No downloads yet"
            subtitle="Paste a direct media URL on the Home tab to start downloading."
            testID="downloads-empty"
          />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <DownloadRow item={item} onOpen={() => router.push({ pathname: '/player', params: { uri: item.local_uri ?? '', title: item.title } })} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function DownloadRow({ item, onOpen }: { item: DownloadItem; onOpen: () => void }) {
  const size = item.size_bytes ?? 0;
  const written = item.bytes_written ?? 0;
  const pct = size > 0 ? Math.min(100, Math.round((written / size) * 100)) : item.status === 'completed' ? 100 : 0;

  const statusColor =
    item.status === 'completed'
      ? colors.success
      : item.status === 'failed' || item.status === 'cancelled'
        ? colors.error
        : item.status === 'paused'
          ? colors.warning
          : colors.brandPrimary;

  const canPlay = item.status === 'completed' && item.local_uri && item.kind === 'video';

  return (
    <View style={styles.row} testID={`download-row-${item.id}`}>
      <View style={[styles.thumb, { backgroundColor: colors.brandTertiary }]}>
        <Ionicons
          name={item.kind === 'audio' ? 'musical-notes' : 'film'}
          size={22}
          color={colors.onBrandTertiary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>

        {/* Progress */}
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
          </View>
          <Text style={styles.pct}>{pct}%</Text>
        </View>

        {/* Status line */}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText} numberOfLines={1}>
            {statusLine(item)}
          </Text>
        </View>
      </View>

      <View style={styles.rowActions}>
        {item.status === 'downloading' ? (
          <IconAction icon="pause" onPress={() => pauseDownload(item.id)} testID={`row-pause-${item.id}`} />
        ) : null}
        {item.status === 'paused' ? (
          <IconAction icon="play" onPress={() => resumeDownload(item.id)} testID={`row-resume-${item.id}`} />
        ) : null}
        {(item.status === 'failed' || item.status === 'cancelled') ? (
          <IconAction icon="refresh" onPress={() => retryDownload(item.id, item)} testID={`row-retry-${item.id}`} />
        ) : null}
        {(item.status === 'downloading' || item.status === 'paused' || item.status === 'queued') ? (
          <IconAction icon="close" onPress={() => cancelDownload(item.id)} testID={`row-cancel-${item.id}`} />
        ) : null}
        {canPlay ? (
          <IconAction icon="play-circle" tint={colors.brandPrimary} onPress={onOpen} testID={`row-play-${item.id}`} />
        ) : null}
        {item.status === 'completed' && item.local_uri ? (
          <IconAction
            icon="share-social"
            onPress={async () => {
              try {
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(item.local_uri!);
                }
              } catch {
                /* noop */
              }
            }}
            testID={`row-share-${item.id}`}
          />
        ) : null}
        <IconAction
          icon="trash-outline"
          tint={colors.error}
          onPress={() => deleteDownloadFile(item)}
          testID={`row-delete-${item.id}`}
        />
      </View>
    </View>
  );
}

function IconAction({
  icon,
  onPress,
  tint,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tint?: string;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.actionBtn} testID={testID}>
      <Ionicons name={icon} size={20} color={tint ?? colors.onSurface} />
    </Pressable>
  );
}

function statusLine(item: DownloadItem): string {
  const size = item.size_bytes ?? 0;
  const written = item.bytes_written ?? 0;
  const remaining = Math.max(0, size - written);
  switch (item.status) {
    case 'downloading': {
      const speed = formatSpeed(item.speed_bps);
      const eta = formatEta(remaining, item.speed_bps);
      return [`${formatBytes(written)} / ${formatBytes(size || null)}`, speed, eta]
        .filter(Boolean)
        .join(' · ');
    }
    case 'paused':
      return `Paused · ${formatBytes(written)} / ${formatBytes(size || null)}`;
    case 'completed':
      return `Completed · ${formatBytes(size || written || null)}`;
    case 'failed':
      return `Failed${item.error ? ` · ${item.error}` : ''}`;
    case 'cancelled':
      return 'Cancelled';
    case 'queued':
      return 'Queued';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    fontWeight: '600',
  },

  searchBar: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },

  chipsWrap: { height: 56, justifyContent: 'center' },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandTertiary,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.onBrandTertiary,
    fontWeight: '700',
  },

  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.onSurface,
  },
  progressRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  pct: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.onSurface,
    minWidth: 40,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  statusRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: fontSize.xs, color: colors.onSurfaceTertiary, flex: 1 },

  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 88,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
