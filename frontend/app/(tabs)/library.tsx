import { Ionicons } from '@expo/vector-icons';
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
import { actions, useAppStore } from '@/src/store/app-store';
import { colors, fontSize, radius, spacing } from '@/src/theme/tokens';

type Tab = 'history' | 'favorites';

export default function LibraryScreen() {
  const store = useAppStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('history');
  const [q, setQ] = useState('');

  const items = useMemo(() => {
    const source = tab === 'history' ? store.history : store.favorites;
    const query = q.trim().toLowerCase();
    if (!query) return source;
    return source.filter(
      (i: { title: string; url: string }) =>
        i.title.toLowerCase().includes(query) || i.url.toLowerCase().includes(query),
    );
  }, [tab, q, store.history, store.favorites]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="library-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
      </View>

      {/* Segmented control */}
      <View style={styles.segmentWrap}>
        <View style={styles.segment}>
          <Pressable
            style={[styles.segmentBtn, tab === 'history' && styles.segmentBtnActive]}
            onPress={() => setTab('history')}
            testID="library-tab-history"
          >
            <Ionicons
              name="time"
              size={16}
              color={tab === 'history' ? colors.onSurface : colors.muted}
            />
            <Text style={[styles.segmentText, tab === 'history' && styles.segmentTextActive]}>
              History ({store.history.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentBtn, tab === 'favorites' && styles.segmentBtnActive]}
            onPress={() => setTab('favorites')}
            testID="library-tab-favorites"
          >
            <Ionicons
              name="heart"
              size={16}
              color={tab === 'favorites' ? colors.onSurface : colors.muted}
            />
            <Text style={[styles.segmentText, tab === 'favorites' && styles.segmentTextActive]}>
              Favorites ({store.favorites.length})
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={`Search ${tab === 'history' ? 'history' : 'favorites'}`}
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          testID="library-search-input"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} testID="library-search-clear">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {items.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon={tab === 'history' ? 'time-outline' : 'heart-outline'}
            title={tab === 'history' ? 'No history yet' : 'No favorites yet'}
            subtitle={
              tab === 'history'
                ? 'Downloaded videos will show up here.'
                : 'Tap the heart on any video to save it here.'
            }
            testID="library-empty"
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              testID={`library-row-${item.id}`}
              onPress={() => router.push({ pathname: '/analyze', params: { url: item.url } })}
              style={styles.row}
            >
              <View style={styles.thumb}>
                <Ionicons
                  name={tab === 'history' ? 'checkmark-circle' : 'heart'}
                  size={22}
                  color={colors.onBrandTertiary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.url}
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  if (tab === 'history') actions.removeHistory(item.id);
                  else actions.removeFavorite(item.id);
                }}
                testID={`library-remove-${item.id}`}
                style={styles.removeBtn}
              >
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  segmentWrap: { paddingHorizontal: spacing.lg },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  segmentBtnActive: {
    backgroundColor: colors.surfaceSecondary,
  },
  segmentText: { fontSize: fontSize.sm, color: colors.muted, fontWeight: '600' },
  segmentTextActive: { color: colors.onSurface, fontWeight: '700' },

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
  searchInput: { flex: 1, fontSize: fontSize.base, color: colors.onSurface },

  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.onSurface },
  rowSub: { fontSize: fontSize.xs, color: colors.onSurfaceTertiary, marginTop: 2 },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
