import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  GalleryImage,
  loadGallery,
  buildGalleryEntries,
  GalleryEntry,
} from '../store/trades';
import { colors } from '../theme';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const IMG_SIZE     = (width - 4) / COLUMN_COUNT;

type Category = 'all' | 'pattern' | 'setup' | 'analysis' | 'mistake' | 'other';

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'all',      label: 'All',      icon: '📁' },
  { key: 'pattern',  label: 'Pattern',  icon: '📊' },
  { key: 'setup',    label: 'Setup',    icon: '🎯' },
  { key: 'analysis', label: 'Analysis', icon: '🔍' },
  { key: 'mistake',  label: 'Mistake',  icon: '⚠️' },
  { key: 'other',    label: 'Other',    icon: '📌' },
];

const CATEGORY_COLORS: Record<Category, string> = {
  all:      colors.green,
  pattern:  '#4fc3f7',
  setup:    '#00d68f',
  analysis: '#ffd166',
  mistake:  '#ff6b6b',
  other:    '#b39ddb',
};

export default function GalleryScreen() {
  const router = useRouter();

  const [images, setImages]         = useState<GalleryImage[]>([]);
  const [activeCategory, setActive] = useState<Category>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await loadGallery();
    setImages(data);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  };

  // Build grouped entries
  const allEntries = useMemo(() => buildGalleryEntries(images), [images]);

  const filteredEntries = useMemo(() => {
    if (activeCategory === 'all') return allEntries;
    return allEntries.filter((e) =>
      e.kind === 'single' ? e.image.category === activeCategory : e.group.category === activeCategory
    );
  }, [allEntries, activeCategory]);

  const countFor = (cat: Category) => {
    if (cat === 'all') return allEntries.length;
    return allEntries.filter((e) =>
      e.kind === 'single' ? e.image.category === cat : e.group.category === cat
    ).length;
  };

  const openEntry = (entry: GalleryEntry) => {
    Haptics.selectionAsync();
    if (entry.kind === 'single') {
      router.push({
        pathname: '/screens/GalleryDetailScreen',
        params:   { id: entry.image.id },
      });
    } else {
      router.push({
        pathname: '/screens/GroupDetailScreen',
        params:   { groupId: entry.group.groupId },
      });
    }
  };

  const renderItem = ({ item }: { item: GalleryEntry }) => {
    if (item.kind === 'single') {
      const img      = item.image;
      const catColor = CATEGORY_COLORS[img.category as Category] ?? colors.green;
      return (
        <TouchableOpacity
          style={styles.cell}
          activeOpacity={0.85}
          onPress={() => openEntry(item)}
        >
          <Image source={{ uri: img.uri }} style={styles.cellImage} />
          <View style={[styles.cellBar, { backgroundColor: catColor }]} />
          <View style={styles.cellOverlay}>
            <Text style={styles.cellTitle} numberOfLines={1}>
              {img.title || 'Untitled'}
            </Text>
          </View>
          {img.tradeId && (
            <View style={styles.linkedBadge}>
              <Ionicons name="link" size={8} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      );
    }

    // Group card — stacked cover effect
    const group    = item.group;
    const catColor = CATEGORY_COLORS[group.category as Category] ?? colors.green;

    return (
      <TouchableOpacity
        style={styles.cell}
        activeOpacity={0.85}
        onPress={() => openEntry(item)}
      >
        {/* Stack effect — 2 layers behind cover */}
        {group.count >= 3 && (
          <View style={[styles.stackLayer, styles.stackBack, { borderColor: catColor + '55' }]} />
        )}
        {group.count >= 2 && (
          <View style={[styles.stackLayer, styles.stackMid, { borderColor: catColor + '77' }]} />
        )}

        {/* Cover image */}
        <View style={styles.groupCoverWrap}>
          <Image source={{ uri: group.coverUri }} style={styles.cellImage} />
          <View style={[styles.cellBar, { backgroundColor: catColor }]} />

          {/* Count badge (top-left) */}
          <View style={[styles.groupCountBadge, { backgroundColor: catColor }]}>
            <Ionicons name="albums" size={9} color="#fff" />
            <Text style={styles.groupCountText}>{group.count}</Text>
          </View>

          {/* Trade link badge (top-right) */}
          {group.tradeId && (
            <View style={styles.linkedBadge}>
              <Ionicons name="link" size={8} color="#fff" />
            </View>
          )}

          {/* Title */}
          <View style={styles.cellOverlay}>
            <Text style={styles.cellTitle} numberOfLines={1}>
              📚 {group.groupName}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📸</Text>
      <Text style={styles.emptyTitle}>No images yet</Text>
      <Text style={styles.emptySubtitle}>
        {activeCategory === 'all'
          ? 'Tap + to add your first chart or pattern screenshot'
          : `No ${activeCategory} images yet`}
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>Trading Gallery</Text>
          <Text style={styles.screenSubtitle}>
            {images.length} {images.length === 1 ? 'image' : 'images'} · {allEntries.filter((e) => e.kind === 'group').length} albums
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/screens/AddImageScreen');
          }}
        >
          <Ionicons name="add" size={22} color={colors.bg} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.filterList}
        renderItem={({ item: cat }) => {
          const isActive = activeCategory === cat.key;
          const catColor = CATEGORY_COLORS[cat.key];
          const count    = countFor(cat.key);

          return (
            <TouchableOpacity
              style={[
                styles.filterChip,
                isActive && { backgroundColor: catColor + '22', borderColor: catColor },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setActive(cat.key);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.filterIcon}>{cat.icon}</Text>
              <Text style={[styles.filterLabel, isActive && { color: catColor }]}>
                {cat.label}
              </Text>
              {count > 0 && (
                <View style={[styles.filterCount, { backgroundColor: isActive ? catColor : colors.card }]}>
                  <Text style={[styles.filterCountText, { color: isActive ? colors.bg : colors.muted }]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <FlatList
        data={filteredEntries}
        keyExtractor={(item) => (item.kind === 'single' ? `s-${item.image.id}` : `g-${item.group.groupId}`)}
        numColumns={COLUMN_COUNT}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={filteredEntries.length === 0 ? styles.emptyList : styles.grid}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colors.bg },
  topBar:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  screenTitle:     { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: 0.5 },
  screenSubtitle:  { fontSize: 12, color: colors.muted, fontFamily: 'monospace', marginTop: 2 },
  addButton:       { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center' },
  filterList:      { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  filterChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginRight: 4 },
  filterIcon:      { fontSize: 12 },
  filterLabel:     { fontSize: 12, fontWeight: '600', color: colors.muted },
  filterCount:     { minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  filterCountText: { fontSize: 9, fontWeight: '700', fontFamily: 'monospace' },
  grid:            { paddingBottom: 100 },

  // Cell base
  cell:      { width: IMG_SIZE, height: IMG_SIZE, position: 'relative', margin: 0.5 },
  cellImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  cellBar:   { position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 3 },

  // Group stack effect
  groupCoverWrap: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 3 },
  stackLayer: {
    position:        'absolute',
    backgroundColor: colors.card,
    borderWidth:     1,
    borderRadius:    2,
  },
  stackMid: {
    top:    3,
    left:   3,
    right:  -3,
    bottom: -3,
    zIndex: 2,
  },
  stackBack: {
    top:    6,
    left:   6,
    right:  -6,
    bottom: -6,
    zIndex: 1,
    opacity: 0.6,
  },

  cellOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 5, paddingVertical: 4, zIndex: 4 },
  cellTitle:   { fontSize: 9, color: '#fff', fontWeight: '600', fontFamily: 'monospace' },

  linkedBadge:     { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  groupCountBadge: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 10, zIndex: 5 },
  groupCountText:  { fontSize: 9, fontWeight: '800', color: '#fff', fontFamily: 'monospace' },

  emptyList:      { flexGrow: 1 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingTop: 80 },
  emptyIcon:      { fontSize: 56, marginBottom: 16 },
  emptyTitle:     { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptySubtitle:  { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});