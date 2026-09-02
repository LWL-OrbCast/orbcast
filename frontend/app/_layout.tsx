import React, { useState, useEffect, useRef } from 'react';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, LogBox } from 'react-native';
// Geo-check (disabled for testing):
// import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/expo';
import { AppKitProvider } from '@reown/appkit-react-native';
import { SmartWalletsProvider } from '@privy-io/expo/smart-wallets';
import { PrivyElements } from '@privy-io/expo/ui';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { Chain } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import Constants from 'expo-constants';
// import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { Analytics } from '../src/lib/analytics';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import '../src/i18n';
import { getSavedLanguage } from '../src/i18n';
import i18n from '../src/i18n';
import { primeHomeHeroAuthedHint } from '../src/lib/homeHeroAuthHint';
import { hydrateTradingEnv } from '../src/store/appStore';
import { PrivyAuthProvider, PRIVY_APP_ID, PRIVY_CLIENT_ID } from '../src/providers/PrivyAuthProvider';
import { MockAuthProvider } from '../src/providers/MockAuthProvider';
import { BuilderConfigProvider, useSyncBuilderConfigToGlobal } from '../src/providers/BuilderConfigProvider';
import { CurrencyProvider } from '../src/providers/CurrencyProvider';
import { HyperliquidAccountStreamProvider } from '../src/providers/HyperliquidAccountStreamProvider';
import { SeamlessSetupProvider } from '../src/providers/SeamlessSetupProvider';
import { useAppStore } from '../src/store/appStore';
import CustomSplashScreen from '../assets/splash/CustomSplashScreen';
import { BottomNavBar } from '../src/components/BottomNavBar';
import { ClaimBannerRoot } from '../src/components/ClaimTradingCreditBanner';
import { IncomingFundsBanner } from '../src/components/IncomingFundsBanner';
import { AppUpdateBanner } from '../src/components/AppUpdateBanner';
// import { checkGeo } from '../src/lib/api';
import { initAppsFlyerSdk } from '../src/lib/appsFlyerAnalytics';
import { RootToastHost } from '../src/components/ToastHost';
import { AppKitHost } from '../src/components/AppKitHost';
import { appKit } from '../src/lib/appKitConfig';
import '../src/lib/hlKernel';

function BuilderConfigSync({ children }: { children: React.ReactNode }) {
  const { refreshForWallet } = useSyncBuilderConfigToGlobal();
  const walletAddress = useAppStore((s) => s.user?.wallet?.address ?? null);

  React.useEffect(() => {
    refreshForWallet(walletAddress);
  }, [walletAddress, refreshForWallet]);

  return <>{children}</>;
}

LogBox.ignoreLogs([
  'This method is deprecated',
  /No matching key\. session topic doesn't exist/,
]);

const originalWarn = console.warn;
console.warn = (...args) => {
  const message = args[0];
  if (typeof message === 'string' && message.includes('This method is deprecated')) {
    return;
  }
  originalWarn(...args);
};

SplashScreen.preventAutoHideAsync();

const extra = (Constants.expoConfig?.extra as any) ?? (Constants as any).manifest2?.extra ?? (Constants as any).manifest?.extra;
const ARBITRUM_RPC_URL: string | undefined =
  process.env.EXPO_PUBLIC_ARBITRUM_RPC_URL ||
  extra?.EXPO_PUBLIC_ARBITRUM_RPC_URL;

const ARB_SEPOLIA_RPC_URL: string | undefined =
  process.env.EXPO_PUBLIC_ARB_SEPOLIA_RPC_URL ||
  extra?.EXPO_PUBLIC_ARB_SEPOLIA_RPC_URL;

const arbitrumChain: Chain = ARBITRUM_RPC_URL
  ? {
      ...arbitrum,
      rpcUrls: {
        ...arbitrum.rpcUrls,
        default: { http: [ARBITRUM_RPC_URL] },
        public: { http: [ARBITRUM_RPC_URL] },
      },
    }
  : arbitrum;

const arbitrumSepoliaChain: Chain = ARB_SEPOLIA_RPC_URL
  ? {
      ...arbitrumSepolia,
      rpcUrls: {
        ...arbitrumSepolia.rpcUrls,
        default: { http: [ARB_SEPOLIA_RPC_URL] },
        public: { http: [ARB_SEPOLIA_RPC_URL] },
      },
    }
  : arbitrumSepolia;

const supportedChains: [Chain, ...Chain[]] = [arbitrumChain, arbitrumSepoliaChain];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
    },
  },
});

function AppContent() {
  const defaultAnimation = Platform.OS === 'web' ? 'fade' : 'ios_from_right';
  const modalAnimation = Platform.OS === 'web' ? 'fade' : 'slide_from_bottom';
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!pathname || pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;
    let screenName = pathname;
    if (pathname === '/') screenName = 'Home';
    else if (pathname === '/markets') screenName = 'Markets';
    else if (pathname.startsWith('/market/')) screenName = `Market_${pathname.split('/')[2]}`;
    else if (pathname === '/profile') screenName = 'Profile';
    else if (pathname === '/login') screenName = 'Login';
    else if (pathname === '/portfolio') screenName = 'Positions';
    else if (pathname === '/rewards') screenName = 'Rewards';
    else if (pathname === '/deposit') screenName = 'Deposit';
    else screenName = pathname.replace(/^\//, '').replace(/\//g, '_') || 'Unknown';
    Analytics.logScreenView(screenName);
  }, [pathname]);

  return (
    <>
      <StatusBar style="dark" backgroundColor={colors.background.primary} />
      <ClaimBannerRoot>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background.primary },
            animation: defaultAnimation,
            freezeOnBlur: true,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="markets" />
          <Stack.Screen name="market/[id]" options={{ animation: defaultAnimation }} />
          <Stack.Screen
            name="profile"
            options={{ animation: modalAnimation, presentation: 'modal' }}
          />
          <Stack.Screen
            name="login"
            options={{
              animation: modalAnimation,
              presentation: 'modal',
              freezeOnBlur: false,
            }}
          />
          <Stack.Screen
            name="deposit"
            options={{ animation: modalAnimation, presentation: 'modal' }}
          />
        </Stack>
      </ClaimBannerRoot>
      <IncomingFundsBanner />
      <AppUpdateBanner />
      <BottomNavBar />
    </>
  );
}

function WebLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <CurrencyProvider>
            <BuilderConfigProvider>
              <BuilderConfigSync>
                <MockAuthProvider>
                  <HyperliquidAccountStreamProvider>
                    <AppContent />
                  </HyperliquidAccountStreamProvider>
                </MockAuthProvider>
              </BuilderConfigSync>
            </BuilderConfigProvider>
          </CurrencyProvider>
        </QueryClientProvider>
        <RootToastHost />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

// Geo-check (disabled for testing)
// function GeoBlockedScreen() {
//   return (
//     <View style={geoStyles.container}>
//       <StatusBar style="light" backgroundColor={colors.background.primary} />
//       <Ionicons name="globe-outline" size={64} color={colors.text.secondary} style={{ marginBottom: 20 }} />
//       <Text style={geoStyles.title}>Region Not Supported</Text>
//       <Text style={geoStyles.subtitle}>
//         This app is not available in your region due to regulatory restrictions.
//       </Text>
//     </View>
//   );
// }
//
// const geoStyles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: colors.background.primary,
//     justifyContent: 'center',
//     alignItems: 'center',
//     paddingHorizontal: 32,
//   },
//   title: {
//     color: colors.text.primary,
//     fontSize: 22,
//     fontWeight: '700',
//     marginBottom: 12,
//     textAlign: 'center',
//   },
//   subtitle: {
//     color: colors.text.secondary,
//     fontSize: 15,
//     lineHeight: 22,
//     textAlign: 'center',
//   },
// });

function NativeLayout() {
  const [isSplashDone, setIsSplashDone] = useState(false);
  const [isI18nReady, setIsI18nReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const fontsReady = fontsLoaded || !!fontError;
  // Geo-check (disabled for testing)
  // const [geoBlocked, setGeoBlocked] = useState(false);
  const nativeSplashHidden = useRef(false);

  // useEffect(() => {
  //   checkGeo()
  //     .then((r) => { if (!r.allowed) setGeoBlocked(true); })
  //     .catch(() => {});
  // }, []);

  useEffect(() => {
    (async () => {
      try {
        const [savedLang] = await Promise.all([
          getSavedLanguage(),
          hydrateTradingEnv().catch(() => {}),
          primeHomeHeroAuthedHint().catch(() => {}),
        ]);
        if (savedLang !== i18n.language) {
          await i18n.changeLanguage(savedLang);
        }
        const { applyRTL } = await import('../src/i18n');
        applyRTL(savedLang);
      } catch {
        /* ignore */
      } finally {
        setIsI18nReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!nativeSplashHidden.current) {
      nativeSplashHidden.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  }, []);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  useEffect(() => {
    initAppsFlyerSdk();
  }, []);

  const handleSplashComplete = () => {
    setIsSplashDone(true);
  };

  if (!isSplashDone || !isI18nReady || !fontsReady) {
    return <CustomSplashScreen onAnimationComplete={handleSplashComplete} />;
  }

  // if (geoBlocked) {
  //   return <GeoBlockedScreen />;
  // }

  if (!PRIVY_APP_ID || !PRIVY_CLIENT_ID) {
    console.error(
      '[HIP-4] Missing EXPO_PUBLIC_PRIVY_APP_ID / EXPO_PUBLIC_PRIVY_CLIENT_ID. ' +
        'Copy frontend/.env.example → frontend/.env.',
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      supportedChains={supportedChains}
      config={{
        embedded: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          solana: { createOnLogin: 'off' },
        },
      }}
    >
      <SmartWalletsProvider>
        <SafeAreaProvider>
          <AppKitProvider instance={appKit}>
            <KeyboardProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <QueryClientProvider client={queryClient}>
                  <CurrencyProvider>
                    <BuilderConfigProvider>
                      <BuilderConfigSync>
                        <PrivyAuthProvider>
                          <HyperliquidAccountStreamProvider>
                            <SeamlessSetupProvider>
                              <AppContent />
                            </SeamlessSetupProvider>
                          </HyperliquidAccountStreamProvider>
                        </PrivyAuthProvider>
                      </BuilderConfigSync>
                    </BuilderConfigProvider>
                  </CurrencyProvider>
                </QueryClientProvider>
                <PrivyElements
                  config={{
                    appearance: {
                      colorScheme: 'light',
                      accentColor: '#22C55E',
                    },
                  }}
                />
                <AppKitHost />
              </GestureHandlerRootView>
              <RootToastHost />
            </KeyboardProvider>
          </AppKitProvider>
        </SafeAreaProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}

export default function RootLayout() {
  if (Platform.OS === 'web') {
    return <WebLayout />;
  }
  return <NativeLayout />;
}
