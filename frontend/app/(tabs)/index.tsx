import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '@/src/components/Card';
import EmptyState from '@/src/components/EmptyState';
import PrimaryButton from '@/src/components/PrimaryButton';
import { actions, useAppStore, useHydrate } from '@/src/store/app-store';
import { colors, fontSize, radius, spacing } from '@/src/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const store = useAppStore();
  useHydrate();

  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);

  // Clipboard detection
  useEffect(() => {
    if (!store.settings.clipboardDetection) return;
    (async () => {
      try {
        const text = await Clipboard.getStringAsync();
        if (text && /^https?:\/\//i.test(text.trim())) {
          if (
            !store.recentUrls.includes(text.trim()) &&
            text.trim() !== url
          ) {
            setClipboardHint(text.trim());
          }
        }
      } catch {
        /* noop */
      }
    })();
  }, [store.settings.clipboardDetection]);

  const onPaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setUrl(text);
        setClipboardHint(null);
      }
    } catch {
      /* noop */
    }
  }, []);

  const onClear = useCallback(() => {
    setUrl('');
    setError(null);
  }, []);

  const onAnalyze = useCallback(async () => {
    const trimmed = url.trim();
    setError(null);
    if (!trimmed) {
      setError('Please enter or paste a video URL.');
      return;
    }
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setError('Please enter a valid http(s) URL.');
      return;
    }
    setBusy(true);
    try {
      actions.addRecentUrl(trimmed);
      router.push({ pathname: '/analyze', params: { url: trimmed } });
    } finally {
      setBusy(false);
    }
  }, [url, router]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="home-screen">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header} testID="home-header">
            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Ionicons name="cloud-download" size={20} color={colors.onBrandPrimary} />
              </View>
              <Text style={styles.brandName}>VidVault</Text>
            </View>
            <Pressable
              onPress={() => router.push('/(tabs)/settings')}
              testID="home-settings-button"
              hitSlop={12}
              style={styles.iconBtn}
            >
              <Ionicons name="settings-outline" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          {/* Hero */}
          <View style={styles.hero} testID="home-hero">
            <LinearGradient
              colors={[colors.brandTertiary, colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.heroKicker}>Direct Media Downloader</Text>
            <Text style={styles.heroTitle}>Save videos you own,{'\n'}anywhere you go.</Text>
            <Text style={styles.heroSub}>
              Paste a direct link to an .mp4, .m3u8, .webm or audio file that you{`'`}re authorized to save.
            </Text>
          </View>

          {/* URL input card */}
          <Card style={styles.inputCard} variant="raised">
            <Text style={styles.inputLabel}>Video URL</Text>
            <TextInput
              value={url}
              onChangeText={(t) => {
                setUrl(t);
                if (error) setError(null);
              }}
              placeholder="Paste or Enter Video URL"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              multiline
              style={styles.input}
              testID="home-url-input"
            />
            {clipboardHint ? (
              <Pressable
                testID="home-clipboard-hint"
                onPress={() => {
                  setUrl(clipboardHint);
                  setClipboardHint(null);
                }}
                style={styles.hintChip}
              >
                <Ionicons name="clipboard-outline" size={14} color={colors.onBrandTertiary} />
                <Text style={styles.hintChipText} numberOfLines={1}>
                  Use copied link: {clipboardHint}
                </Text>
              </Pressable>
            ) : null}
            {error ? (
              <Text style={styles.error} testID="home-error">
                {error}
              </Text>
            ) : null}

            <View style={styles.rowBtns}>
              <PrimaryButton
                label="Paste"
                icon="clipboard-outline"
                variant="secondary"
                onPress={onPaste}
                testID="home-paste-button"
                style={styles.smallBtn}
              />
              <PrimaryButton
                label="Clear"
                icon="close-circle-outline"
                variant="secondary"
                onPress={onClear}
                testID="home-clear-button"
                style={styles.smallBtn}
              />
            </View>
            <PrimaryButton
              label={busy ? 'Analyzing…' : 'Analyze'}
              icon="search"
              onPress={onAnalyze}
              disabled={busy}
              size="lg"
              fullWidth
              testID="home-analyze-button"
            />
            {busy ? (
              <ActivityIndicator size="small" color={colors.brandPrimary} style={{ marginTop: spacing.sm }} />
            ) : null}
          </Card>

          {/* Recent URLs */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent URLs</Text>
              {store.recentUrls.length > 0 ? (
                <Pressable onPress={actions.clearRecentUrls} testID="home-clear-recents">
                  <Text style={styles.linkText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            {store.recentUrls.length === 0 ? (
              <EmptyState
                icon="link-outline"
                title="No recent URLs yet"
                subtitle="URLs you analyze will appear here for quick access."
                testID="home-empty-recents"
              />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {store.recentUrls.slice(0, 5).map((u, idx) => (
                  <Pressable
                    key={u}
                    testID={`home-recent-${idx}`}
                    onPress={() => {
                      setUrl(u);
                    }}
                    onLongPress={() => {
                      router.push({ pathname: '/analyze', params: { url: u } });
                    }}
                  >
                    <Card variant="flat" style={styles.recentRow}>
                      <Ionicons name="time-outline" size={18} color={colors.onSurfaceTertiary} />
                      <Text style={styles.recentText} numberOfLines={1}>
                        {u}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </Card>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Shortcuts */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick access</Text>
            <View style={styles.quickRow}>
              <Pressable
                testID="home-quick-history"
                onPress={() => router.push('/(tabs)/library')}
                style={styles.quickCell}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name="time" size={22} color={colors.onBrandTertiary} />
                </View>
                <Text style={styles.quickLabel}>Download History</Text>
                <Text style={styles.quickCount}>{store.history.length}</Text>
              </Pressable>
              <Pressable
                testID="home-quick-favorites"
                onPress={() => router.push('/(tabs)/library')}
                style={styles.quickCell}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name="heart" size={22} color={colors.onBrandTertiary} />
                </View>
                <Text style={styles.quickLabel}>Favorites</Text>
                <Text style={styles.quickCount}>{store.favorites.length}</Text>
              </Pressable>
              <Pressable
                testID="home-quick-downloads"
                onPress={() => router.push('/(tabs)/downloads')}
                style={styles.quickCell}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name="cloud-download" size={22} color={colors.onBrandTertiary} />
                </View>
                <Text style={styles.quickLabel}>Downloads</Text>
                <Text style={styles.quickCount}>{store.downloads.length}</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.onSurface, letterSpacing: -0.4 },
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

  hero: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  heroKicker: {
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.onBrandTertiary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.onSurface,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  heroSub: {
    marginTop: spacing.sm,
    color: colors.onSurfaceTertiary,
    fontSize: fontSize.base,
    lineHeight: 20,
  },

  inputCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.onSurfaceTertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 60,
    maxHeight: 120,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
  },
  hintChip: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    maxWidth: '100%',
  },
  hintChipText: {
    color: colors.onBrandTertiary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  error: {
    marginTop: spacing.sm,
    color: colors.error,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  rowBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  smallBtn: { flex: 1, paddingHorizontal: 12 },

  section: { marginTop: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.2,
    marginBottom: spacing.md,
  },
  linkText: { color: colors.brandPrimary, fontSize: fontSize.base, fontWeight: '600' },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  recentText: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },

  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quickCell: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  quickLabel: {
    fontSize: fontSize.sm,
    color: colors.onSurface,
    fontWeight: '600',
  },
  quickCount: {
    marginTop: 4,
    fontSize: fontSize.xl,
    color: colors.onSurface,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
