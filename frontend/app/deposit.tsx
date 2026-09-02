import React, { useCallback } from 'react';
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { isAddress } from 'viem';
import { colors } from '../src/theme/colors';
import { useAuth } from '../src/providers/AuthContext';
import { useAppStore } from '../src/store/appStore';
import { showToast } from '../src/lib/toast';
import { DepositPanel } from '../src/components/DepositPanel';

export default function DepositScreen() {
  const router = useRouter();
  const { walletAddress, isAuthenticated, isReady } = useAuth();
  const queryClient = useQueryClient();
  const tradingEnv = useAppStore((s) => s.tradingEnv);

  // Refresh Main trade balance without clearing the active Dedicated book.
  useFocusEffect(
    useCallback(() => {
      if (!walletAddress || !isAddress(walletAddress)) return;
      void queryClient.invalidateQueries({
        queryKey: ['hl_trading_state', tradingEnv, walletAddress],
      });
    }, [walletAddress, queryClient, tradingEnv]),
  );

  const handleClose = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const handleCopyAddress = async () => {
    if (walletAddress) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await Clipboard.setStringAsync(walletAddress);
      showToast('Wallet address copied');
    }
  };

  if (!isReady) {
    return <SafeAreaView style={styles.container} />;
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Deposit</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.notAuthContainer}>
          <Ionicons name="lock-closed" size={48} color={colors.text.tertiary} />
          <Text style={styles.notAuthText}>Sign in to deposit funds</Text>
          <TouchableOpacity 
            style={styles.signInButton}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Funds</Text>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <DepositPanel walletAddress={walletAddress} />

        <View style={styles.addressFooter}>
          <Text style={styles.addressLabel}>Wallet address</Text>
          <TouchableOpacity style={styles.addressBox} onPress={handleCopyAddress}>
            <Text style={styles.addressText} numberOfLines={1}>
              {walletAddress || 'No wallet connected'}
            </Text>
            <Ionicons name="copy" size={20} color={colors.accent.gold} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.primary },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text.primary },
  closeButton: { padding: 8 },
  content: { flex: 1 },
  notAuthContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  notAuthText: { fontSize: 16, color: colors.text.secondary },
  signInButton: { backgroundColor: colors.accent.gold, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
  signInButtonText: { fontSize: 16, fontWeight: '600', color: colors.background.primary },
  addressFooter: { paddingHorizontal: 16, paddingBottom: 24 },
  addressLabel: { fontSize: 14, fontWeight: '500', color: colors.text.secondary, marginBottom: 8 },
  addressBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.accent.gold, gap: 12 },
  addressText: { flex: 1, fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.text.primary },
});
