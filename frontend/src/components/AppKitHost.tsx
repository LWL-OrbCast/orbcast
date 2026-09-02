import React, { useEffect, type ReactNode } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { useSnapshot } from 'valtio';
import { AppKit } from '@reown/appkit-react-native';
import { ConnectionsController, ModalController } from '@reown/appkit-core-react-native';
import { FullWindowOverlay } from 'react-native-screens';
import {
  registerWalletConnectOpener,
  unregisterWalletConnectOpener,
} from '../lib/externalWalletConnect';

/**
 * Expo Router stacks (especially `presentation: 'modal'` routes like login) render
 * above normal RN Modals. FullWindowOverlay lifts AppKit above the navigator on iOS.
 * @see https://docs.reown.com/appkit/react-native/core/installation
 * @see https://github.com/reown-com/appkit-react-native/pull/549
 */
function AppKitModalContentWrapper({ children }: { children: ReactNode }) {
  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
        {children}
      </FullWindowOverlay>
    );
  }

  return (
    <View style={styles.androidOverlay} pointerEvents="box-none">
      {children}
    </View>
  );
}

/** Bridges imperative wallet-open calls to AppKit after the modal layer has mounted. */
function WalletConnectOpener() {
  useEffect(() => {
    registerWalletConnectOpener(() => ModalController.open({ view: 'Connect' }));
    return unregisterWalletConnectOpener;
  }, []);

  return null;
}

/**
 * Renders the Reown AppKit modal layer (WalletConnect wallet picker).
 *
 * Keep the AppKit UI mounted while a WC session is connected so
 * `eth_signTypedData_v4` replies still land after returning from MetaMask.
 * When the picker is closed, disable pointer events so a leftover overlay
 * cannot freeze Home.
 */
function AppKitHostNative() {
  const { open } = useSnapshot(ModalController.state);
  const { isConnected } = useSnapshot(ConnectionsController.state);
  const mountKit = open || isConnected;

  return (
    <View style={styles.host} pointerEvents={open ? 'box-none' : 'none'}>
      {mountKit ? <AppKit modalContentWrapper={AppKitModalContentWrapper} /> : null}
      <WalletConnectOpener />
    </View>
  );
}

export function AppKitHost() {
  if (Platform.OS === 'web') return null;
  return <AppKitHostNative />;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 99999,
    elevation: 99999,
  },
  androidOverlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
  },
});
