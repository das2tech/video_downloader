import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, spacing } from '../theme/tokens';

export default function EmptyState({
  icon = 'cloud-download-outline',
  title,
  subtitle,
  testID,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  testID?: string;
}) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={40} color={colors.brandPrimary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.onSurface,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
