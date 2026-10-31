import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  ScrollView,
  StatusBar,
  Share,
  TextInput,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  GestureHandlerRootView,
  PinchGestureHandler,
  PanGestureHandler,
  TapGestureHandler,
  State,
  PinchGestureHandlerStateChangeEvent,
  PanGestureHandlerStateChangeEvent,
  TapGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import {
  GalleryImage,
  loadGalleryGroup,
  deleteGalleryImage,
  deleteGalleryGroup,
  renameGalleryGroup,
} from '../store/trades';
import { colors } from '../theme';
import { Toast } from '../components/UI';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  pattern:  '#4fc3f7',
  setup:    '#00d68f',
  analysis: '#ffd166',
  mistake:  '#ff6b6b',
  other:    '#b39ddb',
};

const CATEGORY_ICONS: Record<string, string> = {
  pattern:  '📊',
  setup:    '🎯',
  analysis: '🔍',
  mistake:  '⚠️',
  other:    '📌',
};

// ─── Zoomable Image — simple & reliable ───────────────────────────────────────
function ZoomableImage({
  uri,
  onZoomChange,
}: {
  uri: string;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const scale      = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const baseScale = useRef(1);
  const baseX     = useRef(0);
  const baseY     = useRef(0);

  const pinchRef = useRef(null);
  const panRef   = useRef(null);

  const resetZoom = () => {
    baseScale.current = 1;
    baseX.current     = 0;
    baseY.current     = 0;
    Animated.parallel([
      Animated.spring(scale,      { toValue: 1, useNativeDriver: true, friction: 7, tension: 40 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 40 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7, tension: 40 }),
    ]).start();
    onZoomChange?.(false);
  };

  // ── PINCH ──
  const onPinchEvent = (e: any) => {
    const newScale = baseScale.current * e.nativeEvent.scale;
    scale.setValue(Math.max(0.5, Math.min(newScale, 5)));
  };

  const onPinchStateChange = (e: PinchGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      const finalScale = baseScale.current * e.nativeEvent.scale;
      if (finalScale <= 1.05) {
        resetZoom();
      } else {
        const clamped = Math.min(finalScale, 5);
        baseScale.current = clamped;
        scale.setValue(clamped);
        onZoomChange?.(true);
      }
    }
  };

  // ── PAN (only when zoomed) ──
  const onPanEvent = (e: any) => {
    if (baseScale.current > 1) {
      translateX.setValue(baseX.current + e.nativeEvent.translationX);
      translateY.setValue(baseY.current + e.nativeEvent.translationY);
    }
  };

  const onPanStateChange = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      if (baseScale.current > 1) {
        baseX.current += e.nativeEvent.translationX;
        baseY.current += e.nativeEvent.translationY;
      }
    }
  };

  // ── DOUBLE TAP ──
  const onDoubleTap = (e: TapGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.ACTIVE) {
      if (baseScale.current > 1) {
        resetZoom();
      } else {
        baseScale.current = 2.5;
        Animated.spring(scale, {
          toValue: 2.5,
          useNativeDriver: true,
          friction: 7,
          tension: 40,
        }).start();
        onZoomChange?.(true);
      }
    }
  };

  return (
    <PinchGestureHandler
      ref={pinchRef}
      simultaneousHandlers={panRef}
      onGestureEvent={onPinchEvent}
      onHandlerStateChange={onPinchStateChange}
    >
      <Animated.View style={styles.zoomWrap} collapsable={false}>
        <PanGestureHandler
          ref={panRef}
          simultaneousHandlers={pinchRef}
          minPointers={1}
          maxPointers={2}
          onGestureEvent={onPanEvent}
          onHandlerStateChange={onPanStateChange}
        >
          <Animated.View style={styles.zoomWrap} collapsable={false}>
            <TapGestureHandler numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
              <Animated.Image
                source={{ uri }}
                style={[
                  styles.zoomImage,
                  {
                    transform: [
                      { translateX },
                      { translateY },
                      { scale },
                    ],
                  },
                ]}
                resizeMode="contain"
              />
            </TapGestureHandler>
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    </PinchGestureHandler>
  );
}

// ─── Dot Indicators ───────────────────────────────────────────────────────────
function DotIndicators({ total, current }: { total: number; current: number }) {
  if (total <= 1) return null;
  const maxDots = 7;
  const showDots = total <= maxDots;

  return (
    <View style={dotStyles.container}>
      {showDots ? (
        <View style={dotStyles.row}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              style={[dotStyles.dot, i === current && dotStyles.dotActive]}
            />
          ))}
        </View>
      ) : (
        <View style={dotStyles.pillRow}>
          <View style={dotStyles.pill}>
            <Text style={dotStyles.pillText}>{current + 1} / {total}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 8 },
  row:       { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  pillRow:   { flexDirection: 'row', justifyContent: 'center' },
  pill:      { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  pillText:  { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
});

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════

export default function GroupDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const [images, setImages]      = useState<GalleryImage[]>([]);
  const [currentIdx, setIdx]     = useState(0);
  const [swipeEnabled, setSwipe] = useState(true);
  const [showRename, setRename]  = useState(false);
  const [newName, setNewName]    = useState('');
  const [toast, setToast]        = useState({ msg: '', visible: false });

  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToast({ msg, visible: false });
    setTimeout(() => setToast({ msg, visible: true }), 50);
  };

  const load = useCallback(async () => {
    if (!groupId) return;
    const data = await loadGalleryGroup(groupId);
    setImages(data);
    if (data.length > 0) setNewName(data[0].groupName ?? '');
    if (data.length === 0) router.back();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const groupName = images[0]?.groupName ?? 'Album';
  const current   = images[currentIdx];
  const catColor  = current ? (CATEGORY_COLORS[current.category] ?? colors.green) : colors.green;
  const catIcon   = current ? (CATEGORY_ICONS[current.category] ?? '📌') : '📌';

  const headerHeight = 56 + insets.top;
  const bottomMax    = SCREEN_H * 0.42;
  const imageHeight  = SCREEN_H - headerHeight - bottomMax;

  const handleScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (idx !== currentIdx && idx >= 0 && idx < images.length) {
      setIdx(idx);
      Haptics.selectionAsync();
    }
  };

  const goToIndex = (idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * SCREEN_W, animated: true });
    setIdx(idx);
    Haptics.selectionAsync();
  };

  // ── Actions ──
  const handleDeleteImage = () => {
    if (!current) return;
    Alert.alert(
      images.length === 1 ? 'Delete Album?' : 'Delete Image?',
      images.length === 1
        ? 'This is the last image — deleting will remove the entire album.'
        : `Remove image ${currentIdx + 1} of ${images.length}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteGalleryImage(current.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const newImages = images.filter((_, i) => i !== currentIdx);
            if (newImages.length === 0) {
              router.back();
            } else {
              setImages(newImages);
              const newIdx = Math.max(0, currentIdx - 1);
              setIdx(newIdx);
              setTimeout(() => {
                scrollRef.current?.scrollTo({ x: newIdx * SCREEN_W, animated: false });
              }, 50);
              showToast('Image removed');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAlbum = () => {
    Alert.alert(
      'Delete Album',
      `Delete "${groupName}" and all ${images.length} images?\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Album',
          style: 'destructive',
          onPress: async () => {
            if (groupId) await deleteGalleryGroup(groupId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          },
        },
      ]
    );
  };

  const handleRename = async () => {
    if (!newName.trim() || !groupId) return;
    await renameGalleryGroup(groupId, newName.trim());
    setRename(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('✓ Album renamed');
    load();
  };

  const handleShare = async () => {
    if (!current) return;
    try {
      await Share.share({
        url:     current.uri,
        message: `${current.title}\n\n${current.notes ?? ''}`,
      });
    } catch {}
  };

  // ── Loading ──
  if (!current) {
    return (
      <View style={styles.container}>
        {/* Hide expo-router header */}
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.loadingWrap}>
          <Ionicons name="albums-outline" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={styles.loadingText}>Loading album...</Text>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* ── HIDE the expo-router default header ─────────────────── */}
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        {/* ── Custom Header ───────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { Haptics.selectionAsync(); router.back(); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerCenter}
            onPress={() => { setRename(true); Haptics.selectionAsync(); }}
            activeOpacity={0.7}
          >
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                📚 {groupName}
              </Text>
              <Ionicons name="create-outline" size={12} color="rgba(255,255,255,0.4)" />
            </View>
            <View style={styles.headerBadgeRow}>
              <View style={[styles.headerCatBadge, { backgroundColor: catColor + '22', borderColor: catColor + '55' }]}>
                <Text style={styles.headerCatEmoji}>{catIcon}</Text>
                <Text style={[styles.headerCatText, { color: catColor }]}>
                  {current.category.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.headerCounter}>{currentIdx + 1}/{images.length}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Dot indicators ──────────────────────────────────────── */}
        <DotIndicators total={images.length} current={currentIdx} />

        {/* ── Swipeable carousel ──────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={swipeEnabled}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={styles.carousel}
          bounces={false}
        >
          {images.map((img) => (
            <View key={img.id} style={styles.slide}>
              <ZoomableImage
                uri={img.uri}
                onZoomChange={(zoomed) => setSwipe(!zoomed)}
              />
            </View>
          ))}
        </ScrollView>

        {/* ── Bottom panel ────────────────────────────────────────── */}
        <View style={[styles.bottomPanel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Thumbnail strip */}
          {images.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbStrip}
            >
              {images.map((img, idx) => (
                <TouchableOpacity
                  key={img.id}
                  onPress={() => goToIndex(idx)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.thumbWrap, idx === currentIdx && styles.thumbWrapActive]}>
                    <Image source={{ uri: img.uri }} style={styles.thumb} />
                    {idx === currentIdx && (
                      <View style={[styles.thumbActiveBorder, { borderColor: catColor }]} />
                    )}
                  </View>
                  <View style={[
                    styles.thumbNumBadge,
                    { backgroundColor: idx === currentIdx ? catColor : 'rgba(255,255,255,0.15)' },
                  ]}>
                    <Text style={[
                      styles.thumbNumText,
                      { color: idx === currentIdx ? '#fff' : 'rgba(255,255,255,0.5)' },
                    ]}>
                      {idx + 1}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Current image info card */}
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle} numberOfLines={1}>{current.title}</Text>
                <View style={styles.infoMetaRow}>
                  <Ionicons name="calendar-outline" size={10} color={colors.muted} />
                  <Text style={styles.infoMeta}>{current.dateStr}</Text>
                  {current.tradePair && (
                    <>
                      <Ionicons name="link" size={10} color={colors.green} />
                      <Text style={[styles.infoMeta, { color: colors.green }]}>{current.tradePair}</Text>
                    </>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={handleDeleteImage} style={styles.deleteImgBtn}>
                <Ionicons name="trash-outline" size={15} color={colors.red} />
              </TouchableOpacity>
            </View>

            {current.notes ? (
              <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.infoNotes}>{current.notes}</Text>
              </ScrollView>
            ) : (
              <View style={styles.noNotesWrap}>
                <Ionicons name="document-text-outline" size={14} color={colors.muted} />
                <Text style={styles.noNotes}>No notes for this image</Text>
              </View>
            )}
          </View>

          {/* Album actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnRename]}
              onPress={() => { setRename(true); Haptics.selectionAsync(); }}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={15} color={colors.blue} />
              <Text style={[styles.actionText, { color: colors.blue }]}>Rename Album</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDelete]}
              onPress={handleDeleteAlbum}
              activeOpacity={0.7}
            >
              <Ionicons name="trash" size={15} color={colors.red} />
              <Text style={[styles.actionText, { color: colors.red }]}>Delete Album</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Rename Modal ────────────────────────────────────────── */}
        <Modal visible={showRename} transparent animationType="fade" onRequestClose={() => setRename(false)}>
          <TouchableOpacity
            style={styles.renameOverlay}
            activeOpacity={1}
            onPress={() => setRename(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.renameSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
              onPress={() => {}}
            >
              <View style={styles.renameHandle} />
              <Text style={styles.renameTitle}>Rename Album</Text>
              <Text style={styles.renameHint}>
                This will update the name for all {images.length} images in this album.
              </Text>

              <TextInput
                style={styles.renameInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Album name"
                placeholderTextColor={colors.muted}
                autoFocus
                maxLength={40}
                selectTextOnFocus
              />

              <View style={styles.renameCharCount}>
                <Text style={[
                  styles.renameCharText,
                  { color: newName.length > 35 ? colors.red : colors.muted },
                ]}>
                  {newName.length}/40
                </Text>
              </View>

              <View style={styles.renameActions}>
                <TouchableOpacity
                  onPress={() => setRename(false)}
                  style={styles.renameCancel}
                  activeOpacity={0.7}
                >
                  <Text style={styles.renameCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleRename}
                  style={[styles.renameSave, !newName.trim() && { opacity: 0.4 }]}
                  disabled={!newName.trim()}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={16} color={colors.bg} />
                  <Text style={styles.renameSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Toast message={toast.msg} visible={toast.visible} />
      </Animated.View>
    </GestureHandlerRootView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#000' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: 'monospace' },

  // Header
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.95)', gap: 8 },
  headerBtn:      { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  headerCenter:   { flex: 1, alignItems: 'center', gap: 4 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle:    { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  headerBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerCatBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  headerCatEmoji: { fontSize: 10 },
  headerCatText:  { fontSize: 8, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },
  headerCounter:  { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },

  // Carousel & Zoom
  carousel:  { flex: 1, backgroundColor: '#000' },
  slide:     { width: SCREEN_W, flex: 1, justifyContent: 'center', alignItems: 'center' },
  zoomWrap:  { width: SCREEN_W, flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  zoomImage: { width: SCREEN_W, height: '100%' },

  // Bottom panel
  bottomPanel: {
    backgroundColor:      colors.bg,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingTop:           12,
    maxHeight:            SCREEN_H * 0.42,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 20 },
    }),
  },

  // Thumbnails
  thumbStrip:        { paddingHorizontal: 12, gap: 8, paddingBottom: 10 },
  thumbWrap:         { width: 52, height: 52, borderRadius: 8, overflow: 'hidden' },
  thumbWrapActive:   { transform: [{ scale: 1.08 }] },
  thumb:             { width: '100%', height: '100%', borderRadius: 6 },
  thumbActiveBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 6, borderWidth: 2 },
  thumbNumBadge:     { position: 'absolute', top: -3, right: -3, borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.bg },
  thumbNumText:      { fontSize: 8, fontWeight: '800', fontFamily: 'monospace' },

  // Info card
  infoCard:     { marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 8 },
  infoHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoTitle:    { color: colors.text, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  infoMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  infoMeta:     { color: colors.muted, fontSize: 10, fontFamily: 'monospace' },
  deleteImgBtn: { padding: 8, backgroundColor: colors.red + '12', borderRadius: 10, borderWidth: 0.5, borderColor: colors.red + '33' },
  notesScroll:  { maxHeight: 70 },
  infoNotes:    { color: colors.text, fontSize: 12, lineHeight: 18, opacity: 0.85 },
  noNotesWrap:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  noNotes:      { color: colors.muted, fontSize: 11, fontStyle: 'italic', fontFamily: 'monospace' },

  // Actions
  actionRow:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  actionBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12, borderWidth: 0.5 },
  actionBtnRename: { backgroundColor: colors.blue + '10', borderColor: colors.blue + '33' },
  actionBtnDelete: { backgroundColor: colors.red + '10', borderColor: colors.red + '33' },
  actionText:      { fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },

  // Rename modal
  renameOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  renameSheet:      { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border },
  renameHandle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  renameTitle:      { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  renameHint:       { color: colors.muted, fontSize: 11, fontFamily: 'monospace', marginBottom: 16, lineHeight: 16 },
  renameInput:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 15, color: colors.text, fontWeight: '600' },
  renameCharCount:  { alignItems: 'flex-end', marginTop: 4, marginBottom: 8 },
  renameCharText:   { fontSize: 10, fontFamily: 'monospace' },
  renameActions:    { flexDirection: 'row', gap: 10, marginTop: 8 },
  renameCancel:     { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border },
  renameCancelText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  renameSave:       { flex: 1, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: colors.green },
  renameSaveText:   { color: colors.bg, fontSize: 14, fontWeight: '800' },
});