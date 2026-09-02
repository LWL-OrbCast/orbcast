import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import Toast from 'react-native-toast-message';

import { toastConfig } from './ToastConfig';
import { useTopStripContentHeight } from './ClaimTradingCreditBanner';
import { useAppStore } from '../store/appStore';
import { DEFAULT_TOAST_TOP_OFFSET, setToastTopOffset } from '../lib/toast';

export const toastHostStyle = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
});

/** Routes presented as iOS native modals — root toasts render behind them. */
export const MODAL_ROUTES_WITH_OWN_TOAST = new Set(['/profile']);

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const tradingEnv = useAppStore((s) => s.tradingEnv);
  const demoStripVisible = tradingEnv === 'demo' && pathname !== '/login';
  const topStripContentHeight = useTopStripContentHeight();
  const topOffset = demoStripVisible
    ? DEFAULT_TOAST_TOP_OFFSET + insets.top + topStripContentHeight
    : DEFAULT_TOAST_TOP_OFFSET;

  useEffect(() => {
    setToastTopOffset(topOffset);
  }, [topOffset]);

  return (
    <View pointerEvents="box-none" style={toastHostStyle.host}>
      <Toast config={toastConfig} topOffset={topOffset} />
    </View>
  );
}

export function RootToastHost() {
  const pathname = usePathname();
  if (MODAL_ROUTES_WITH_OWN_TOAST.has(pathname)) return null;
  return <ToastHost />;
}
