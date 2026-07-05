import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme/tokens';

type Props = {
  onPress: () => void;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  testID?: string;
  style?: ViewStyle;
};

export default function PrimaryButton({
  onPress,
  label,
  icon,
  variant = 'primary',
  disabled,
  fullWidth,
  size = 'md',
  testID,
  style,
}: Props) {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';
  const isDanger = variant === 'danger';

  const bg = disabled
    ? colors.surfaceTertiary
    : isPrimary
      ? colors.brandPrimary
      : isDanger
        ? colors.error
        : isGhost
          ? 'transparent'
          : colors.surfaceSecondary;

  const fg = disabled
    ? colors.muted
    : isPrimary || isDanger
      ? colors.onBrandPrimary
      : isSecondary
        ? colors.onSurface
        : colors.brandPrimary;

  const borderColor = isSecondary ? colors.border : 'transparent';

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.lg,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: isSecondary ? 1 : 0,
          opacity: pressed ? 0.85 : 1,
        },
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    minHeight: 44,
  },
  lg: {
    paddingVertical: 16,
    minHeight: 52,
  },
  label: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
