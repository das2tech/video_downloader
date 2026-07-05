import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

import { colors } from '@/src/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
          tabBarTestID: 'tab-home',
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Downloads',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cloud-download" color={color} size={size} />
          ),
          tabBarTestID: 'tab-downloads',
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums" color={color} size={size} />
          ),
          tabBarTestID: 'tab-library',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-sharp" color={color} size={size} />
          ),
          tabBarTestID: 'tab-settings',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surfaceSecondary,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
