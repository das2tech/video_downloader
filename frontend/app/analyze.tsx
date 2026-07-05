import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '@/src/components/Card';
import PrimaryButton from '@/src/components/PrimaryButton';
import { analyzeUrl } from '@/src/services/analyzer';
import { formatBytes, startDownload } from '@/src/services/downloader';
import { actions, useAppStore } from '@/src/store/app-store';
import { colors, fontSize, radius, spacing } from '@/src/theme/tokens';
import type { AnalyzeResponse, VideoFormat } from '@/src/types';

// Fallback hero image (from design guidelines)
const FALLBACK_THUMB =
  'https://images.pexels.com/photos/3540375/pexels-photo-3540375.jpeg?auto=compress&cs=tinysrgb&w=800';

export default function AnalyzeScreen() {
  const router = useRouter();
  const { url } = useLocalSearchParams<{ url: string }>();
  const store = useAppStore();

  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; data: AnalyzeResponse }
  >({ kind: 'loading' });

  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!url) return;
    setState({ kind: 'loading' });
    try {
      const data = await analyzeUrl(url);
      setState({ kind: 'ready', data });
      if (data.formats.length) setSelectedFormatId(data.formats[0].id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: 'error', message });
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  const data = state.kind === 'ready' ? state.data : null;

  const isFav = useMemo(
    () => (url ? store.favorites.some((f) => f.url === url) : false),
    [store.favorites, url],
  );

  const selectedFormat: VideoFormat | null = useMemo(() => {
    if (!data) return null;
    return data.formats.find((f) => f.id === selectedFormatId) ?? data.formats[0] ?? null;
  }, [data, selectedFormatId]);

  const onDownload = useCallback(async () => {
    if (!data || !selectedFormat) return;
    setDownloading(true);
    setDownloadError(null);
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = data.title || 'Video';
    try {
      await startDownload({
        id,
        title,
        sourceUrl: data.source_url,
        format: selectedFormat,
      });
      actions.addHistory({
        id,
        url: data.source_url,
        title,
        thumbnail: data.thumbnail ?? null,
        resolution: selectedFormat.label,
        ext: selectedFormat.ext,
        size_bytes: selectedFormat.size_bytes ?? null,
        created_at: Date.now(),
      });
      router.replace('/(tabs)/downloads');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDownloadError(message);
    } finally {
      setDownloading(false);
    }
  }, [data, selectedFormat, router]);

  const toggleFav = useCallback(() => {
    if (!data) return;
    actions.toggleFavorite({
      id: `fav_${Date.now()}`,
      url: data.source_url,
      title: data.title || 'Video',
      created_at: Date.now(),
    });
  }, [data]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="analyze-screen">
      {/* Top bar */}
      <View style={styles.topbar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.iconBtn}
          testID="analyze-back-button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topbarTitle} numberOfLines={1}>
          Video Info
        </Text>
        <Pressable
          onPress={toggleFav}
          hitSlop={12}
          style={styles.iconBtn}
          testID="analyze-favorite-button"
          disabled={!data}
        >
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={22}
            color={isFav ? colors.brandPrimary : colors.onSurface}
          />
        </Pressable>
      </View>

      {state.kind === 'loading' ? (
        <View style={styles.center} testID="analyze-loading">
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={styles.loadingText}>Analyzing URL…</Text>
          <Text style={styles.loadingSub} numberOfLines={2}>
            {url}
          </Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.center} testID="analyze-error">
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle" size={40} color={colors.error} />
          </View>
          <Text style={styles.errorTitle}>Couldn{`'`}t analyze this URL</Text>
          <Text style={styles.errorText}>{state.message}</Text>
          <PrimaryButton label="Retry" icon="refresh" onPress={load} testID="analyze-retry-button" />
        </View>
      ) : !data?.supported ? (
        <View style={styles.center} testID="analyze-unsupported">
          <View style={styles.errorIcon}>
            <Ionicons name="ban" size={40} color={colors.warning} />
          </View>
          <Text style={styles.errorTitle}>Unsupported URL</Text>
          <Text style={styles.errorText}>
            {data?.reason ??
              `This URL doesn${"'"}t look like a direct media file.`}
          </Text>
          <PrimaryButton
            label="Try another URL"
            icon="arrow-back"
            variant="secondary"
            onPress={() => router.back()}
            testID="analyze-back-cta"
          />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero */}
            <View style={styles.hero}>
              <Image
                source={data.thumbnail || FALLBACK_THUMB}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
              />
              <LinearGradient
                colors={['transparent', 'rgba(26,25,24,0.75)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroBottom}>
                <View style={styles.kindPill}>
                  <Ionicons
                    name={data.formats[0]?.kind === 'audio' ? 'musical-notes' : 'videocam'}
                    size={14}
                    color={colors.onBrandPrimary}
                  />
                  <Text style={styles.kindPillText}>
                    {(data.formats[0]?.kind ?? 'video').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {data.title}
                </Text>
                {data.author ? (
                  <Text style={styles.heroAuthor} numberOfLines={1}>
                    {data.author}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Meta */}
            <Card style={styles.metaCard} variant="flat">
              <MetaRow icon="cube-outline" label="Size" value={formatBytes(data.size_bytes)} />
              <View style={styles.divider} />
              <MetaRow
                icon="document-text-outline"
                label="Type"
                value={data.mime || 'unknown'}
              />
              <View style={styles.divider} />
              <MetaRow
                icon="link-outline"
                label="Source"
                value={data.source_url}
                mono
              />
            </Card>

            {/* Formats */}
            <Text style={styles.sectionTitle}>Available formats</Text>
            <View style={{ gap: spacing.sm }}>
              {data.formats.map((f) => {
                const selected = selectedFormat?.id === f.id;
                return (
                  <Pressable
                    key={f.id}
                    testID={`analyze-format-${f.id}`}
                    onPress={() => setSelectedFormatId(f.id)}
                    style={[styles.formatRow, selected && styles.formatRowSelected]}
                  >
                    <View style={styles.formatIcon}>
                      <Ionicons
                        name={f.kind === 'audio' ? 'musical-notes' : 'film'}
                        size={20}
                        color={selected ? colors.onBrandPrimary : colors.brandPrimary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formatLabel}>{f.label}</Text>
                      <Text style={styles.formatSub}>
                        {f.ext.toUpperCase()} · {formatBytes(f.size_bytes)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.radio,
                        selected && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
                      ]}
                    >
                      {selected ? (
                        <Ionicons name="checkmark" size={14} color={colors.onBrandPrimary} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>

          {/* Sticky download CTA */}
          <View style={styles.stickyBar} testID="analyze-sticky-bar">
            {downloadError ? (
              <View style={styles.downloadErrorBanner} testID="analyze-download-error">
                <Ionicons name="warning" size={16} color={colors.onError} />
                <Text style={styles.downloadErrorText} numberOfLines={2}>
                  {downloadError}
                </Text>
              </View>
            ) : null}
            <View style={styles.stickyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.stickyLabel}>
                  {selectedFormat?.label ?? 'Selected format'}
                </Text>
                <Text style={styles.stickyValue}>
                  {formatBytes(selectedFormat?.size_bytes ?? null)}
                </Text>
              </View>
              <PrimaryButton
                label={downloading ? 'Starting…' : 'Download'}
                icon="cloud-download"
                size="lg"
                onPress={onDownload}
                disabled={downloading || !selectedFormat}
                testID="analyze-download-button"
              />
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function MetaRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={18} color={colors.onSurfaceTertiary} />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, mono && { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  topbarTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.onSurface,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.md,
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  loadingText: { color: colors.onSurface, fontSize: fontSize.lg, fontWeight: '700' },
  loadingSub: { color: colors.muted, fontSize: fontSize.sm, textAlign: 'center' },
  errorIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.onSurface,
    textAlign: 'center',
  },
  errorText: {
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },

  hero: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    justifyContent: 'flex-end',
  },
  heroBottom: { padding: spacing.lg },
  kindPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  kindPillText: {
    color: colors.onBrandPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroTitle: {
    color: '#fff',
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroAuthor: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.sm,
    marginTop: 2,
  },

  metaCard: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  metaLabel: {
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    fontWeight: '600',
    width: 60,
  },
  metaValue: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.onSurface,
    fontWeight: '600',
  },
  divider: { height: 1, backgroundColor: colors.divider },

  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.onSurface,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    letterSpacing: -0.2,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  formatRowSelected: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandTertiary,
  },
  formatIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatLabel: { fontSize: fontSize.lg, fontWeight: '700', color: colors.onSurface },
  formatSub: { fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  stickyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  downloadErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.error,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  downloadErrorText: {
    color: colors.onError,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  stickyLabel: {
    fontSize: fontSize.xs,
    letterSpacing: 1,
    color: colors.onSurfaceTertiary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  stickyValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.onSurface,
    marginTop: 2,
    letterSpacing: -0.3,
  },
});
