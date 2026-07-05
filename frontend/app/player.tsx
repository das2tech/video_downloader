import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/src/theme/tokens';

export default function PlayerScreen() {
  const { uri, title } = useLocalSearchParams<{ uri: string; title?: string }>();
  const router = useRouter();
  const videoRef = useRef<VideoView>(null);

  const player = useVideoPlayer(uri || '', (p) => {
    p.loop = false;
    p.play();
  });

  const [isPlaying, setIsPlaying] = useState(true);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const sub = player.addListener('playingChange', (e) => {
      setIsPlaying(e.isPlaying);
    });
    return () => sub.remove();
  }, [player]);

  const togglePlay = () => {
    if (player.playing) player.pause();
    else player.play();
  };

  const cycleRate = () => {
    const next = rate >= 2 ? 0.5 : Number((rate + 0.5).toFixed(2));
    setRate(next);
    player.playbackRate = next;
  };

  const seek = (delta: number) => {
    const t = Math.max(0, (player.currentTime ?? 0) + delta);
    player.currentTime = t;
  };

  return (
    <View style={styles.root} testID="player-screen">
      <VideoView
        ref={videoRef}
        player={player}
        style={styles.video}
        allowsFullscreen
        allowsPictureInPicture
        nativeControls={false}
        contentFit="contain"
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.iconBtn}
          testID="player-close-button"
        >
          <Ionicons name="chevron-down" size={22} color={'#fff'} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? 'Playing'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Bottom controls */}
      <View style={styles.controls}>
        <Pressable
          style={styles.ctrlBtn}
          onPress={() => seek(-10)}
          hitSlop={10}
          testID="player-rewind-button"
        >
          <Ionicons name="play-back" size={24} color="#fff" />
          <Text style={styles.ctrlText}>-10s</Text>
        </Pressable>
        <Pressable
          style={styles.playBtn}
          onPress={togglePlay}
          testID="player-play-button"
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color={colors.onSurface} />
        </Pressable>
        <Pressable
          style={styles.ctrlBtn}
          onPress={() => seek(10)}
          hitSlop={10}
          testID="player-forward-button"
        >
          <Ionicons name="play-forward" size={24} color="#fff" />
          <Text style={styles.ctrlText}>+10s</Text>
        </Pressable>
        <Pressable
          style={styles.ctrlBtn}
          onPress={cycleRate}
          hitSlop={10}
          testID="player-rate-button"
        >
          <Ionicons name="speedometer" size={22} color="#fff" />
          <Text style={styles.ctrlText}>{rate}x</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '700',
    textAlign: 'center',
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  ctrlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 60,
  },
  ctrlText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '600' },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
