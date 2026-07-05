import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, shadow } from '../theme/tokens';

export default function Card({
  children,
  style,
  variant = 'raised',
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  variant?: 'raised' | 'flat' | 'tinted';
}) {
  return (
    <View
      style={[
        styles.base,
        variant === 'raised' && styles.raised,
        variant === 'flat' && styles.flat,
        variant === 'tinted' && styles.tinted,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  raised: {
    backgroundColor: colors.surfaceSecondary,
    ...shadow.tier1,
  },
  flat: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tinted: {
    backgroundColor: colors.surfaceTertiary,
  },
});
