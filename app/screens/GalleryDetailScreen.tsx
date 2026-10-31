import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  StatusBar,
  Modal,
  Animated,
  Platform,
  Share,
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
  Trade,
  loadGallery,
  loadTrades,
  deleteGalleryImage,
} from '../store/trades';
import { colors } from '../theme';
import { Toast } from '../components/UI';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  pattern:  { label: 'Pattern',  icon: '📊', color: '#4fc3f7' },
  setup:    { label: 'Setup',    icon: '🎯', color: '#00d68f' },
  analysis: { label: 'Analysis', icon: '🔍', color: '#ffd166' },
  mistake:  { label: 'Mistake',  icon: '⚠️', color: '#ff6b6b' },
  other:    { label: 'Other',    icon: '📌', color: '#b39ddb' },
};

// ─── Zoomable Image — simple & reliable ───────────────────────────────────────
function ZoomableImage({
  uri,
  onZoomChange,
  style,
}: {
  uri: string;
  onZoomChange?: (zoomed: boolean) => void;
  style?: any;
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <PinchGestureHandler
      ref={pinchRef}
      simultaneousHandlers={panRef}
      onGestureEvent={onPinchEvent}
      onHandlerStateChange={onPinchStateChange}
    >
      <Animated.View style={[zoomStyles.wrap, style]} collapsable={false}>
        <PanGestureHandler
          ref={panRef}
          simultaneousHandlers={pinchRef}
          minPointers={1}
          maxPointers={2}
          onGestureEvent={onPanEvent}
          onHandlerStateChange={onPanStateChange}
        >
          <Animated.View style={[zoomStyles.wrap, style]} collapsable={false}>
            <TapGestureHandler numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
              <Animated.Image
                source={{ uri }}
                style={[
                  zoomStyles.image,
                  style,
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

const zoomStyles = StyleSheet.create({
  wrap:  { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  image: {},
});

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════

export default function GalleryDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [image, setImage]             = useState<GalleryImage | null>(null);
  const [linkedTrade, setLinkedTrade] = useState<Trade | null>(null);
  const [fullscreen, setFullscreen]   = useState(false);
  const [toast, setToast]             = useState({ msg: '', visible: false });

  const showToast = (msg: string) => {
    setToast({ msg, visible: false });
    setTimeout(() => setToast({ msg, visible: true }), 50);
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const gallery = await loadGallery();
        const found = gallery.find((img) => img.id === Number(id));
        if (!found) return;
        setImage(found);

        if (found.tradeId) {
          const trades = await loadTrades();
          const trade = trades.find((t) => t.id === found.tradeId);
          if (trade) setLinkedTrade(trade);
        }
      })();
    }, [id])
  );

  const handleDelete = () => {
    Alert.alert(
      'Delete Image',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!image) return;
            await deleteGalleryImage(image.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    if (!image) return;
    try {
      await Share.share({
        url:     image.uri,
        message: `${image.title}\n\n${image.notes ?? ''}`,
      });
    } catch {}
  };

  const formatPnl = (pnl: number) => {
    if (pnl > 0) return `+$${pnl.toFixed(2)}`;
    if (pnl < 0) return `-$${Math.abs(pnl).toFixed(2)}`;
    return '$0.00';
  };

  const pnlColor = (pnl: number) =>
    pnl > 0 ? '#00d68f' : pnl < 0 ? '#ff6b6b' : colors.muted;

  const resultColor = (result: string) => {
    switch (result) {
      case 'win':  return '#00d68f';
      case 'loss': return '#ff6b6b';
      case 'be':   return '#ffd166';
      case 'open': return '#4fc3f7';
      default:     return colors.muted;
    }
  };

  // ── Loading ──
  if (!image) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.15)" />
        <Text style={styles.loadingText}>Loading image...</Text>
      </View>
    );
  }

  const cat = CATEGORY_CONFIG[image.category] ?? CATEGORY_CONFIG.other;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Hide expo-router default header */}
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

        {/* ── Custom Header ───────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { Haptics.selectionAsync(); router.back(); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {image.title || 'Untitled'}
            </Text>
            <View style={styles.headerBadgeRow}>
              <View style={[styles.headerCatBadge, { backgroundColor: cat.color + '18', borderColor: cat.color + '44' }]}>
                <Text style={styles.headerCatIcon}>{cat.icon}</Text>
                <Text style={[styles.headerCatText, { color: cat.color }]}>{cat.label}</Text>
              </View>
              <Text style={styles.headerDate}>{image.dateStr}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.headerBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Main Image — tap for fullscreen ───────────────────── */}
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => { setFullscreen(true); Haptics.selectionAsync(); }}
          >
            <Image source={{ uri: image.uri }} style={styles.mainImage} />
            {/* Category color bar */}
            <View style={[styles.imageCatBar, { backgroundColor: cat.color }]} />
            {/* Fullscreen hint */}
            <View style={styles.imageHint}>
              <Ionicons name="expand-outline" size={13} color="#fff" />
              <Text style={styles.imageHintText}>Tap for fullscreen · Pinch to zoom</Text>
            </View>
          </TouchableOpacity>

          {/* ── Action bar ────────────────────────────────────────── */}
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnEdit]}
              onPress={() => {
                Haptics.selectionAsync();
                router.push({
                  pathname: '/screens/AddImageScreen',
                  params: { editId: image.id },
                });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil" size={15} color={colors.green} />
              <Text style={[styles.actionBtnText, { color: colors.green }]}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnShare]}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={15} color={colors.blue} />
              <Text style={[styles.actionBtnText, { color: colors.blue }]}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDelete]}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={15} color={colors.red} />
              <Text style={[styles.actionBtnText, { color: colors.red }]}>Delete</Text>
            </TouchableOpacity>
          </View>

          {/* ── Info Card ─────────────────────────────────────────── */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>CATEGORY</Text>
                <View style={[styles.categoryBadge, { backgroundColor: cat.color + '18', borderColor: cat.color + '44' }]}>
                  <Text style={styles.categoryIcon}>{cat.icon}</Text>
                  <Text style={[styles.categoryText, { color: cat.color }]}>{cat.label}</Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>DATE</Text>
                <View style={styles.infoValueRow}>
                  <Ionicons name="calendar-outline" size={12} color={colors.muted} />
                  <Text style={styles.infoValue}>{image.dateStr}</Text>
                </View>
              </View>
            </View>

            {image.tradePair && (
              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>LINKED PAIR</Text>
                  <View style={styles.infoValueRow}>
                    <Ionicons name="link" size={12} color={colors.green} />
                    <Text style={[styles.infoValue, { color: colors.green, fontWeight: '700' }]}>
                      {image.tradePair}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* ── Linked Trade Card ─────────────────────────────────── */}
          {linkedTrade && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LINKED TRADE</Text>
              <TouchableOpacity
                style={styles.tradeCard}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push({
                    pathname: '/screens/TradeDetailScreen',
                    params: { id: linkedTrade.id },
                  });
                }}
              >
                <View style={styles.tradeCardLeft}>
                  <Text style={styles.tradePair}>{linkedTrade.pair}</Text>
                  <View style={styles.tradeMetaRow}>
                    <Text style={[styles.tradeDir, { color: linkedTrade.dir === 'BUY' ? '#00d68f' : '#ff6b6b' }]}>
                      {linkedTrade.dir}
                    </Text>
                    <Text style={styles.tradeDot}>·</Text>
                    <Text style={styles.tradeDate}>{linkedTrade.dateStr}</Text>
                    <Text style={styles.tradeDot}>·</Text>
                    <Text style={styles.tradeDate}>{linkedTrade.strategy}</Text>
                  </View>
                </View>
                <View style={styles.tradeCardRight}>
                  <Text style={[styles.tradePnl, { color: pnlColor(linkedTrade.pnl) }]}>
                    {formatPnl(linkedTrade.pnl)}
                  </Text>
                  <View style={[styles.tradeResultBadge, {
                    backgroundColor: resultColor(linkedTrade.result) + '22',
                    borderColor: resultColor(linkedTrade.result) + '66',
                  }]}>
                    <Text style={[styles.tradeResultText, { color: resultColor(linkedTrade.result) }]}>
                      {linkedTrade.result.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
          )}

          {!linkedTrade && !image.tradeId && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LINKED TRADE</Text>
              <View style={styles.noTradeCard}>
                <Ionicons name="unlink-outline" size={16} color={colors.muted} />
                <Text style={styles.noTradeText}>No trade linked to this image</Text>
              </View>
            </View>
          )}

          {/* ── Notes ─────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NOTES</Text>
            {image.notes ? (
              <View style={styles.notesCard}>
                <Text style={styles.notesText}>{image.notes}</Text>
              </View>
            ) : (
              <View style={styles.noNotesCard}>
                <Ionicons name="document-text-outline" size={16} color={colors.muted} />
                <Text style={styles.noNotesText}>No notes added</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* ── Fullscreen Modal with Zoom ──────────────────────────── */}
        <Modal
          visible={fullscreen}
          transparent
          animationType="fade"
          onRequestClose={() => setFullscreen(false)}
        >
          <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.fullscreenContainer}>
              <StatusBar barStyle="light-content" backgroundColor="#000" />

              {/* Close button */}
              <TouchableOpacity
                style={[styles.fullscreenClose, { top: insets.top + 10 }]}
                onPress={() => { setFullscreen(false); Haptics.selectionAsync(); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>

              {/* Zoom hint */}
              <View style={[styles.fullscreenHint, { top: insets.top + 14 }]}>
                <Ionicons name="scan-outline" size={12} color="rgba(255,255,255,0.5)" />
                <Text style={styles.fullscreenHintText}>Pinch to zoom · Double tap</Text>
              </View>

              {/* Zoomable image */}
              <ZoomableImage
                uri={image.uri}
                style={{ width: SCREEN_W, height: SCREEN_H * 0.75 }}
              />

              {/* Bottom info */}
              <View style={[styles.fullscreenInfo, { bottom: Math.max(insets.bottom, 20) + 20 }]}>
                <View style={[styles.fullscreenCatBadge, { backgroundColor: cat.color + '22', borderColor: cat.color + '55' }]}>
                  <Text style={styles.fullscreenCatIcon}>{cat.icon}</Text>
                  <Text style={[styles.fullscreenCatText, { color: cat.color }]}>{cat.label}</Text>
                </View>
                <Text style={styles.fullscreenTitle}>{image.title || 'Untitled'}</Text>
                <Text style={styles.fullscreenDate}>{image.dateStr}</Text>
              </View>
            </View>
          </GestureHandlerRootView>
        </Modal>

        <Toast message={toast.msg} visible={toast.visible} />
      </View>
    </GestureHandlerRootView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollView: { flex: 1 },
  scrollContent: {},

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    gap: 12,
  },
  loadingText: { color: colors.muted, fontSize: 13, fontFamily: 'monospace' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  headerCenter:   { flex: 1, alignItems: 'center', gap: 4 },
  headerTitle:    { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: 0.3 },
  headerBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerCatBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  headerCatIcon:  { fontSize: 10 },
  headerCatText:  { fontSize: 8, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },
  headerDate:     { fontSize: 10, color: colors.muted, fontFamily: 'monospace' },

  // Main image
  mainImage: {
    width: SCREEN_W,
    height: SCREEN_W * 0.7,
    resizeMode: 'cover',
  },
  imageCatBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  imageHint: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  imageHintText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'monospace',
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  actionBtnEdit:   { backgroundColor: colors.green + '10', borderColor: colors.green + '33' },
  actionBtnShare:  { backgroundColor: colors.blue + '10', borderColor: colors.blue + '33' },
  actionBtnDelete: { backgroundColor: colors.red + '10', borderColor: colors.red + '33' },
  actionBtnText:   { fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },

  // Info card
  infoCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoItem: {
    flex: 1,
    gap: 6,
  },
  infoDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginHorizontal: 14,
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.muted,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  infoValue: {
    fontSize: 12,
    color: colors.text,
    fontFamily: 'monospace',
    fontWeight: '600',
  },

  // Category badge
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryIcon: { fontSize: 12 },
  categoryText: { fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },

  // Section
  section:      { paddingHorizontal: 16, paddingVertical: 8 },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.muted,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
    marginBottom: 8,
  },

  // Trade card
  tradeCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tradeCardLeft: { flex: 1 },
  tradePair: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  tradeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tradeDir: { fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  tradeDot: { fontSize: 10, color: colors.muted },
  tradeDate: { fontSize: 10, color: colors.muted, fontFamily: 'monospace' },
  tradeCardRight: { alignItems: 'flex-end', gap: 4, marginRight: 4 },
  tradePnl: { fontSize: 16, fontWeight: '800', fontFamily: 'monospace' },
  tradeResultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  tradeResultText: { fontSize: 9, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },

  noTradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  noTradeText: { fontSize: 12, color: colors.muted, fontFamily: 'monospace' },

  // Notes
  notesCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  notesText: { fontSize: 13, color: colors.text, lineHeight: 20 },
  noNotesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  noNotesText: { fontSize: 12, color: colors.muted, fontFamily: 'monospace' },

  // Fullscreen modal
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  fullscreenHint: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  fullscreenHintText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'monospace',
  },
  fullscreenInfo: {
    position: 'absolute',
    left: 20,
    right: 20,
    gap: 6,
  },
  fullscreenCatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  fullscreenCatIcon: { fontSize: 11 },
  fullscreenCatText: { fontSize: 9, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },
  fullscreenTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  fullscreenDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'monospace',
  },
});