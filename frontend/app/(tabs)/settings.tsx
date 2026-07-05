import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { actions, useAppStore } from '@/src/store/app-store';
import { colors, fontSize, radius, spacing } from '@/src/theme/tokens';

export default function SettingsScreen() {
  const store = useAppStore();
  const s = store.settings;
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="settings-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Section title="Downloads">
          <PickerRow
            label="Default resolution"
            value={s.defaultResolution === 'original' ? 'Original quality' : 'Audio only'}
            options={[
              { value: 'original', label: 'Original quality' },
              { value: 'audio', label: 'Audio only' },
            ]}
            onChange={(v) => actions.updateSettings({ defaultResolution: v as 'original' | 'audio' })}
            testID="setting-default-resolution"
          />
          <Divider />
          <PickerRow
            label="Default format"
            value={s.defaultFormat === 'auto' ? 'Auto' : s.defaultFormat.toUpperCase()}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'mp4', label: 'MP4 (video)' },
              { value: 'm4a', label: 'M4A (audio)' },
            ]}
            onChange={(v) => actions.updateSettings({ defaultFormat: v as 'auto' | 'mp4' | 'm4a' })}
            testID="setting-default-format"
          />
          <Divider />
          <PickerRow
            label="Max parallel downloads"
            value={String(s.maxParallelDownloads)}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => actions.updateSettings({ maxParallelDownloads: Number(v) })}
            testID="setting-max-parallel"
          />
          <Divider />
          <ToggleRow
            label="Wi-Fi only downloads"
            value={s.wifiOnly}
            onValueChange={(v) => actions.updateSettings({ wifiOnly: v })}
            testID="setting-wifi-only"
          />
          <Divider />
          <ToggleRow
            label="Auto retry failed downloads"
            value={s.autoRetry}
            onValueChange={(v) => actions.updateSettings({ autoRetry: v })}
            testID="setting-auto-retry"
          />
        </Section>

        <Section title="General">
          <ToggleRow
            label="Clipboard detection"
            value={s.clipboardDetection}
            onValueChange={(v) => actions.updateSettings({ clipboardDetection: v })}
            testID="setting-clipboard"
          />
        </Section>

        <Section title="Storage">
          <ActionRow
            label="Clear recent URLs"
            icon="link-outline"
            onPress={() => actions.clearRecentUrls()}
            testID="setting-clear-recents"
          />
          <Divider />
          <ActionRow
            label="Clear history"
            icon="time-outline"
            onPress={() => actions.clearHistory()}
            testID="setting-clear-history"
          />
          <Divider />
          <ActionRow
            label="Clear completed downloads"
            icon="checkmark-done-outline"
            onPress={() => actions.clearCompletedDownloads()}
            testID="setting-clear-completed"
          />
        </Section>

        <Section title="About">
          <ActionRow
            label="About VidVault"
            icon="information-circle-outline"
            onPress={() => setShowAbout(true)}
            testID="setting-about"
          />
          <Divider />
          <ActionRow
            label="Privacy Policy"
            icon="shield-checkmark-outline"
            onPress={() => setShowPrivacy(true)}
            testID="setting-privacy"
          />
        </Section>

        <Text style={styles.version}>VidVault · v1.0.0 · Direct media only</Text>
      </ScrollView>

      <InfoModal
        visible={showAbout}
        onClose={() => setShowAbout(false)}
        title="About VidVault"
        body={`VidVault is a direct media downloader for links you're authorized to save.\n\nIt does not bypass DRM, paywalls, authentication, or platform restrictions. If a URL doesn't point to a direct media file (mp4, m3u8, webm, mp3, etc.), the app will let you know it's unsupported.\n\nAll history and downloads are stored locally on your device.`}
        testID="about-modal"
      />
      <InfoModal
        visible={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        title="Privacy Policy"
        body={`We don't collect personal data.\n\n• URLs you paste are analyzed by the app's backend only to detect the media type and size.\n• History, favorites and downloads live on your device, never on our servers.\n• We don't use analytics, ads or third-party trackers.\n• You can wipe all data any time from Settings › Storage.`}
        testID="privacy-modal"
      />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function ToggleRow({
  label,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }}
        thumbColor={'#fff'}
      />
    </View>
  );
}

function ActionRow({
  label,
  icon,
  onPress,
  testID,
}: {
  label: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.brandPrimary} />
      </View>
      <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function PickerRow({
  label,
  value,
  options,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.row} onPress={() => setOpen(true)} testID={testID}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{label}</Text>
            {options.map((opt) => (
              <Pressable
                key={opt.value}
                style={styles.optionRow}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                testID={`${testID}-opt-${opt.value}`}
              >
                <Text style={styles.optionLabel}>{opt.label}</Text>
                {opt.value === value ? (
                  <Ionicons name="checkmark" size={20} color={colors.brandPrimary} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function InfoModal({
  visible,
  onClose,
  title,
  body,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  testID?: string;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose} testID={testID}>
        <View style={styles.infoSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.infoBody}>{body}</Text>
          <Pressable style={styles.closeBtn} onPress={onClose} testID={`${testID}-close`}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },

  section: { gap: spacing.sm },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.onSurfaceTertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginLeft: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: fontSize.base, color: colors.onSurface, fontWeight: '600', flex: 1 },
  rowValue: { fontSize: fontSize.sm, color: colors.onSurfaceTertiary, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.md },

  version: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  modalScrim: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  optionLabel: { fontSize: fontSize.base, color: colors.onSurface, fontWeight: '600' },

  infoSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  infoBody: { fontSize: fontSize.base, color: colors.onSurfaceTertiary, lineHeight: 22 },
  closeBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeBtnText: { color: colors.onBrandPrimary, fontWeight: '700', fontSize: fontSize.base },
});
