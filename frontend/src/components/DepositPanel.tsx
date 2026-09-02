import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useActiveEthereumWallet } from '../hooks/useActiveEthereumWallet';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';
import { useIsFocused } from '@react-navigation/native';
import QRCodeStyled from 'react-native-qrcode-styled';
import { useQuery } from '@tanstack/react-query';
import { arbitrum } from 'viem/chains';
import { createPublicClient, encodeFunctionData, formatUnits, http, isAddress, parseUnits } from 'viem';
import { colors } from '../theme/colors';
import { showToast, showSuccessToast, showErrorToast } from '../lib/toast';
import { depositWithPermit } from '../lib/api';
import {
  withdrawFromHyperliquid,
  computeSpotBalanceUsd,
  getSpotMetaAndAssetCtxsCached,
  getHyperliquidTradingState,
  isPooledAccountMode,
} from '../lib/hyperliquid';
import { ensureExternalWalletOnHlSigningChain } from '../lib/externalWalletConnect';
import {
  useHyperliquidAccountStream,
  type HyperliquidAccountStream,
} from '../lib/useHyperliquidAccountStream';
import { savePendingTransaction } from '../lib/arbTransfers';
import {
  loadFundsPendingIncoming,
  saveFundsPendingDeposit,
  saveFundsPendingWithdraw,
  FUNDS_PENDING_DEPOSIT_TTL_MS,
  FUNDS_PENDING_WITHDRAW_TTL_MS,
} from '../lib/fundsPendingIncoming';
import { useFundsPendingStore } from '../store/fundsPendingStore';
import { useIsDemo } from './DemoMode';
import { useAppStore } from '../store/appStore';
import { useAuth } from '../providers/AuthContext';
import { Analytics } from '../lib/analytics';
import { useTranslation } from 'react-i18next';
import { FundsTransferBridge } from './FundsTransferDiagram';
import { TradeTransferBottomSheet } from './TradeTransferBottomSheet';
import { TweenedStatText } from './TweenedStatText';
import { RollingNumber } from './RollingNumber';
import { ProfileAccountInfoSheet } from './ProfileAccountInfoSheet';
import { BouncingDots } from './BouncingDots';
import { WalletHubCardArt } from './WalletHubCardArt';
import { ProfileAvatar } from './ProfileAvatar';
import { ONBOARDING_ACCOUNT_INFO_QUERY_KEY, fetchOnboardingAccountInfo } from '../lib/onboarding';
import { useDisplayCurrency } from '../providers/CurrencyProvider';
type Hex = `0x${string}`;

const BALANCE_EMPTY = '—';

/** Survives DepositPanel remounts so reconnect/empty-hydrate can't flash $0.00. */
const lastKnownPositiveTradeValueByKey = new Map<string, number>();
/** Same idea for transferable/withdrawable — Trade→Wallet Available was flashing $0 on WS gaps. */
const lastKnownPositiveTradeWithdrawableByKey = new Map<string, number>();

const formatBalanceAmount = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const USDC_ICON = require('../../assets/images/usdc-icon.webp');
const ARBITRUM_PILL_ICON = require('../../assets/images/symbols/arb-icon.webp');

const CANDLES_CONFETTI = require('../../assets/trade-confetti.json');
const CASH_CONFETTI = require('../../assets/cash-confetti.json');

/** Profile wallet card inline refresh — hidden; incoming labels cover transfer UX. */
const SHOW_PROFILE_WALLET_REFRESH = false;

/** White ticket face, green only in the far corner — not a mint wash. */
const PROFILE_FUNDS_GRADIENT = ['#FFFFFF', '#FFFFFF', '#BBF7D0'] as const;
const PROFILE_DESTINATION_FUNDS_GRADIENT = ['#FFFFFF', '#FFFFFF', '#DCFCE7'] as const;

const ARBITRUM_CHAIN_ID = 42161 as const;
const ARBITRUM_CHAIN_ID_HEX = '0xa4b1' as const;

// Arbitrum native USDC (per HL Bridge2 docs)
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
// Hyperliquid Bridge2 contract (mainnet)
const HL_BRIDGE2 = '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7' as const;
const COPY_FEEDBACK_MS = 2000;

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'decimals', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'nonce', type: 'uint256' }],
  },
] as const;

export function DepositPanel(props: {
  walletAddress: string | null;
  refreshTrigger?: number;
  highlightDeposit?: boolean;
  /** Profile onboarding — pulse Trade balance card */
  highlightTrade?: boolean;
  /** Profile: email shown in Account info sheet */
  profileEmail?: string | null;
  /** Profile: Privy account createdAt fallback when user_onboarding row is missing */
  accountCreatedAtFallback?: Date | string | null;
  /** Profile: open QR modal for wallet address */
  onOpenWalletQr?: () => void;
  /** When set (e.g. Profile), reuses this stream so only one HL WebSocket runs for the screen. */
  accountStream?: HyperliquidAccountStream;
  /** Profile scroll: smooth scroll when Wallet ⇄ Trade expand opens so the form is visible */
  parentScrollRef?: React.RefObject<ScrollView | null>;
  parentScrollYRef?: React.MutableRefObject<number>;
  /** Profile onboarding tooltip — anchored after wallet or Trade row */
  profileOnboardingTooltip?: React.ReactNode;
  profileOnboardingTooltipPlacement?: 'wallet' | 'destination' | null;
  /** Measured for profile onboarding scroll (Trade row) */
  destinationRowRef?: React.RefObject<View | null>;
}) {
  const { t } = useTranslation();
  // Demo mode: rename the right card from "Trade Balance" to "Demo Balance"
  // and disable the wallet ↔ trade transfer CTA. Wallet-side USDC isn't on
  // testnet (Privy embedded wallet still on Arbitrum mainnet) so transferring
  // between the two is meaningless in demo. Mainnet behaviour unchanged.
  const isDemo = useIsDemo();
  const tradingEnv = useAppStore((s) => s.tradingEnv);
  const isFocused = useIsFocused();
  const { wallet: connectedWallet, address: hookWalletAddress } = useActiveEthereumWallet();
  const { client: smartWalletClient } = useSmartWallets();
  const { getAccessToken, smartWalletAddress, user } = useAuth();
  const publicClient = useMemo(() => createPublicClient({ chain: arbitrum, transport: http() }), []);
  const { formatDisplayPrice, isConverted, isDisplayCurrencyLoading } = useDisplayCurrency();
  /** Muted fiat line under USDC — always 2 dp when USD (fmtUsd uses 4–6 dp for tiny amounts). */
  const formatWalletFiatEstimate = useCallback(
    (usd: number) => {
      if (isConverted) return formatDisplayPrice(usd);
      const body = Math.abs(usd).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `≈ $${body}`;
    },
    [isConverted, formatDisplayPrice],
  );
  const [walletUsdc, setWalletUsdc] = useState<bigint | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  // Persistent pending-tx UX. `isDepositing` / `isWithdrawing` flip back to
  // false too early for users watching the cards — HL withdraws in particular
  // return from the exchange call in ~1 s even though the L1 USDC arrives
  // in 2–3 min. Tracking amount + baseline balance + timestamp lets us keep
  // an "incoming" label on the destination card until the balance actually
  // moves (or a safety timeout expires), independent of the button spinner.
  const [pendingWithdraw, setPendingWithdraw] = useState<{
    amount: string;
    startedAt: number;
    baselineWalletRaw: bigint | null;
  } | null>(null);
  // Same pending-tx shape for the deposit direction. We previously tracked
  // just the amount, which had two UX issues the user surfaced:
  //   1. It appeared the moment the confirm modal dismissed — before the
  //      permit signature / RPC submit had even happened, which made the
  //      trade-card label show up eagerly with nothing actually in-flight.
  //   2. It cleared in the handler's `finally`, BEFORE HL's WebSocket
  //      reflected the new trade balance (`refreshBalances()` only
  //      re-reads the wallet's Arbitrum USDC, not the HL balance). Users
  //      saw the pending label disappear, then had to pull-to-refresh to
  //      see the new trade balance.
  // Now we snapshot the baseline trade balance at submit time and keep the
  // label alive until that balance actually ticks up (or a safety TTL
  // expires). The label is also set later in the flow so it aligns with
  // the broadcast, not the confirm tap.
  const [pendingDeposit, setPendingDeposit] = useState<{
    amount: string;
    startedAt: number;
    baselineTradeUsd: number;
  } | null>(null);
  // Mirror HL pending state into the app-wide store that drives the sticky
  // IncomingFundsBanner. Purely additive — the local state above remains the
  // single source of detection/clearing; these just reflect each change so the
  // banner can show/clear it on any screen.
  const mirrorHlDeposit = useFundsPendingStore((s) => s.setHlDeposit);
  const mirrorHlWithdraw = useFundsPendingStore((s) => s.setHlWithdraw);
  // Bumped by the banner the instant its on-chain poll confirms an incoming
  // wallet credit landed — so we re-read the balance immediately rather than
  // waiting for the next 30s poll (which left the card lagging the banner).
  const walletCreditNonce = useFundsPendingStore((s) => s.walletCreditNonce);
  const isInitialLoadRef = useRef(true);
  const [usdcDecimals, setUsdcDecimals] = useState<number>(6);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [depositAmount, setDepositAmount] = useState<string>('');
  const [isDepositing, setIsDepositing] = useState(false);
  const lastTxHashRef = useRef<Hex | null>(null);
  const [lastTransferError, setLastTransferError] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [expandedTransfer, setExpandedTransfer] = useState<'toTrade' | 'toWallet' | null>(null);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositAddressCopied, setDepositAddressCopied] = useState(false);
  const depositAddressCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [infoModal, setInfoModal] = useState<null | { title: string; body: string | React.ReactNode }>(null);

  // ─── Confirm transfer modal ────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; resolve: (v: boolean) => void } | null>(null);

  const requestConfirm = useCallback((title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmModal({ title, message, resolve });
    });
  }, []);

  const handleConfirmYes = useCallback(() => {
    confirmModal?.resolve(true);
    setConfirmModal(null);
  }, [confirmModal]);

  const handleConfirmNo = useCallback(() => {
    confirmModal?.resolve(false);
    setConfirmModal(null);
  }, [confirmModal]);

  // ─── Deposit button highlight animation ──────────────────────────────
  const depositPulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!props.highlightDeposit) { depositPulseAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(depositPulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(depositPulseAnim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [props.highlightDeposit, depositPulseAnim]);

  const depositPulseScale = depositPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const depositPulseOpacity = depositPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  const destinationPulseAnim = useRef(new Animated.Value(0)).current;
  const highlightDestinationCard = !!props.highlightTrade;

  useEffect(() => {
    if (!highlightDestinationCard) {
      destinationPulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(destinationPulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(destinationPulseAnim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [highlightDestinationCard, destinationPulseAnim]);

  const destinationPulseScale = destinationPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const destinationPulseOpacity = destinationPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  const fundsOnboardingStep = props.highlightDeposit ? 1 : props.highlightTrade ? 2 : 0;
  const bridgeActiveTarget =
    pendingDeposit || pendingWithdraw || expandedTransfer || props.highlightTrade
      ? 'trade'
      : null;
  const bridgeActiveDirection =
    pendingDeposit || expandedTransfer === 'toTrade' || props.highlightTrade
      ? 'toDestination'
      : pendingWithdraw || expandedTransfer === 'toWallet'
        ? 'toWallet'
        : null;

  const [accountInfoOpen, setAccountInfoOpen] = useState(false);

  // ─── Smart Account USDC recovery ──────────────────────────────────────
  const [smartAccountUsdc, setSmartAccountUsdc] = useState<bigint>(0n);
  const [isRecovering, setIsRecovering] = useState(false);

  // ─── Confetti celebration ──────────────────────────────────────────
  const [activeConfetti, setActiveConfetti] = useState<'candles' | 'cash' | null>(null);
  const confettiRef = useRef<LottieView>(null);
  const confettiStarted = useRef(false);

  const playConfetti = useCallback((type: 'candles' | 'cash') => {
    confettiStarted.current = false;
    setActiveConfetti(type);
    setTimeout(() => {
      confettiStarted.current = true;
      confettiRef.current?.play();
    }, 100);
  }, []);

  const onConfettiFinish = useCallback((isCancelled: boolean) => {
    if (!isCancelled && confettiStarted.current) {
      confettiStarted.current = false;
      setActiveConfetti(null);
    }
  }, []);

  // ─── Refresh button spin + cooldown (refs declared early, handler below) ─
  const spinAnim = useRef(new Animated.Value(0)).current;
  const isRefreshingManual = useRef(false);
  const lastManualRefresh = useRef(0);
  const REFRESH_COOLDOWN_MS = 5_000;

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const connectedAddress = (hookWalletAddress || props.walletAddress || null) as string | null;

  const internalHlStream = useHyperliquidAccountStream(
    props.accountStream
      ? undefined
      : connectedAddress && isAddress(connectedAddress)
        ? (connectedAddress as Hex)
        : undefined,
  );
  const stream = props.accountStream ?? internalHlStream;

  // Deposit bridge is always Main wallet ↔ Main HL trade. The shared account WS
  // may be retargeted to a Dedicated sub — ignore those snapshots here.
  const streamIsMasterBook = useMemo(() => {
    if (!connectedAddress || !isAddress(connectedAddress)) return false;
    const sub = stream.subscribedUser;
    if (!sub) return false;
    return sub.toLowerCase() === connectedAddress.toLowerCase();
  }, [connectedAddress, stream.subscribedUser]);

  // HTTP snapshot when panel is shown — recovers Trade Balance if WS is zombie after long idle.
  // Only hydrate when the socket is on Main; otherwise we'd refresh a Dedicated book.
  useEffect(() => {
    if (!isFocused || !streamIsMasterBook) return;
    void stream.hydrateFromRest(true);
  }, [isFocused, streamIsMasterBook, stream.hydrateFromRest]);

  // Spot meta (prices + token list) needed to value non-USDC spot holdings. Cached globally.
  const [spotMetaData, setSpotMetaData] = useState<any>(null);
  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    getSpotMetaAndAssetCtxsCached()
      .then((d) => { if (!cancelled) setSpotMetaData(d); })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [isFocused]);

  // Optional REST safety-net. Primary source is the WS stream (which now covers
  // main + HIP-3 via allDexsClearinghouseState — see useHyperliquidAccountStream).
  //
  // Important: the query key includes tradingEnv. Without that, React Query can
  // hand us the live/mainnet account snapshot while demo WS is reconnecting,
  // which makes the Demo Balance card flicker between testnet and real balance
  // until the user changes screens.
  const {
    data: tradingStateQuery,
    isFetching: tradingStateFetching,
    isFetched: tradingStateFetched,
  } = useQuery({
    queryKey: ['hl_trading_state', tradingEnv, connectedAddress],
    enabled: !!connectedAddress && isAddress(connectedAddress),
    queryFn: async () => getHyperliquidTradingState(connectedAddress as Hex),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    refetchInterval: 10000,
    staleTime: 5000,
    refetchOnReconnect: true,
    // Keep prior Main snapshot visible while Dedicated book has the shared WS
    // and while focus refetch is in flight — avoids "—" Trade Balance.
    refetchOnMount: 'always',
  });

  // Aggregate perp totals across ALL dexes (main + HIP-3). WS payload shape per SDK:
  // { clearinghouseStates: [["", mainState], ["xyz", hip3State], ...] } — keyed by dex here.
  // Zeroed when the shared stream is on a Dedicated sub (bridge is Main-only).
  const allPerpStates = streamIsMasterBook ? stream.clearinghouseStatesByDex : undefined;
  const streamPerpAccountValueUsd = useMemo(() => {
    if (!streamIsMasterBook) return 0;
    if (!allPerpStates) {
      const v = parseFloat(stream.clearinghouseState?.marginSummary?.accountValue ?? '0');
      return Number.isFinite(v) ? v : 0;
    }
    return Object.values(allPerpStates).reduce((sum: number, ch: any) => {
      const v = parseFloat(ch?.marginSummary?.accountValue ?? '0');
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [streamIsMasterBook, allPerpStates, stream.clearinghouseState?.marginSummary?.accountValue]);

  const streamPerpWithdrawableUsd = useMemo(() => {
    if (!streamIsMasterBook) return 0;
    if (!allPerpStates) {
      const v = parseFloat(stream.clearinghouseState?.withdrawable ?? '0');
      return Number.isFinite(v) ? v : 0;
    }
    return Object.values(allPerpStates).reduce((sum: number, ch: any) => {
      const v = parseFloat(ch?.withdrawable ?? '0');
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [streamIsMasterBook, allPerpStates, stream.clearinghouseState?.withdrawable]);

  const streamSpotBalanceUsd = useMemo(() => {
    if (!streamIsMasterBook) return 0;
    const { spotBalanceUsd: v } = computeSpotBalanceUsd(stream.spotState, spotMetaData);
    return Number.isFinite(v) ? v : 0;
  }, [streamIsMasterBook, stream.spotState, spotMetaData]);

  // Trade Balance matches getHyperliquidTradingState. In unified/portfolio
  // modes, REST/spot state is authoritative because individual perp DEX WS
  // states are not meaningful for balance display.
  const queryIsPooledAccount = isPooledAccountMode(tradingStateQuery?.accountAbstractionMode);

  // Hold last positive Trade Balance across WS reconnect / empty-hydrate (and
  // panel remounts) so we don't flash $0.00 when we already knew funds existed.
  const tradeValueCacheKey = `${tradingEnv}:${connectedAddress ?? ''}`;

  const streamHasAccountSnapshot =
    streamIsMasterBook &&
    !!(stream.spotState || stream.clearinghouseState || stream.clearinghouseStatesByDex);

  const tradeAccountValueUsd = useMemo(() => {
    const restVal =
      tradingStateQuery && Number.isFinite(tradingStateQuery.accountValueUsd)
        ? tradingStateQuery.accountValueUsd
        : null;
    const modeKnown = tradingStateQuery?.accountAbstractionMode != null;
    const held = lastKnownPositiveTradeValueByKey.get(tradeValueCacheKey);

    // Bridge UI is always Main wallet ↔ Main HL. Prefer REST for the master
    // address; only blend live WS when the shared socket is actually on Main.
    // When Dedicated owns the socket, REST (+ sticky) must carry the number.
    let computed: number;
    if (!streamIsMasterBook) {
      if (restVal != null) computed = restVal;
      else if (held != null && held > 0.01) computed = held;
      else computed = 0;
    } else if (queryIsPooledAccount) {
      if (restVal != null && restVal > 0.01 && streamSpotBalanceUsd > 0) {
        computed =
          streamSpotBalanceUsd < restVal * 0.85 ? restVal : streamSpotBalanceUsd;
      } else if (restVal != null) {
        computed = restVal;
      } else if (streamSpotBalanceUsd > 0) {
        computed = streamSpotBalanceUsd;
      } else {
        computed = 0;
      }
    } else if (!modeKnown) {
      if (held != null && held > 0.01) computed = held;
      else if (restVal != null) computed = restVal;
      else if (streamSpotBalanceUsd > 0) computed = streamSpotBalanceUsd;
      else computed = 0;
    } else {
      const streamTotal = streamPerpAccountValueUsd + streamSpotBalanceUsd;
      if (restVal != null && restVal > 0.01 && streamTotal > 0.01) {
        // Prefer REST when stream undercounts mid-reconnect.
        computed = streamTotal < restVal * 0.85 ? restVal : streamTotal;
      } else if (restVal != null) {
        computed = restVal;
      } else if (isDemo) {
        computed = streamTotal;
      } else if (streamTotal > 0) {
        computed = streamTotal;
      } else {
        computed = 0;
      }
    }

    if (Number.isFinite(computed) && computed > 0.01) {
      if (modeKnown || !streamIsMasterBook) {
        lastKnownPositiveTradeValueByKey.set(tradeValueCacheKey, computed);
      }
      return computed;
    }

    // Only clear sticky after a settled zero REST — not mid-refetch / retarget.
    if (
      modeKnown &&
      restVal != null &&
      restVal <= 0.01 &&
      tradingStateFetched &&
      !tradingStateFetching
    ) {
      lastKnownPositiveTradeValueByKey.delete(tradeValueCacheKey);
      return computed;
    }

    if (held != null && held > 0.01) {
      if (!streamHasAccountSnapshot || computed <= 0.01 || tradingStateFetching) {
        return held;
      }
    }

    return computed;
  }, [
    isDemo,
    queryIsPooledAccount,
    streamIsMasterBook,
    streamPerpAccountValueUsd,
    streamSpotBalanceUsd,
    streamHasAccountSnapshot,
    tradeValueCacheKey,
    tradingStateQuery,
    tradingStateFetched,
    tradingStateFetching,
  ]);

  const tradeWithdrawableUsd = useMemo(() => {
    let computed = 0;
    if (tradingStateQuery && Number.isFinite(tradingStateQuery.withdrawableUsd)) {
      // Main bridge withdrawable always from Main REST when available.
      if (!streamIsMasterBook || queryIsPooledAccount) {
        computed = tradingStateQuery.withdrawableUsd;
      }
    }
    if (!(computed > 0.01)) {
      if (queryIsPooledAccount && tradingStateQuery && Number.isFinite(tradingStateQuery.withdrawableUsd)) {
        computed = tradingStateQuery.withdrawableUsd;
      } else if (streamPerpWithdrawableUsd > 0) {
        computed = streamPerpWithdrawableUsd;
      } else if (isDemo) {
        computed = streamPerpWithdrawableUsd;
      } else if (tradingStateQuery && Number.isFinite(tradingStateQuery.withdrawableUsd)) {
        computed = tradingStateQuery.withdrawableUsd;
      } else {
        computed = streamPerpWithdrawableUsd;
      }
    }

    const held = lastKnownPositiveTradeWithdrawableByKey.get(tradeValueCacheKey);
    const restWd =
      tradingStateQuery && Number.isFinite(tradingStateQuery.withdrawableUsd)
        ? tradingStateQuery.withdrawableUsd
        : null;
    const modeKnown = tradingStateQuery?.accountAbstractionMode != null;

    // Live positive — accept real rises/drops (open positions move this).
    if (Number.isFinite(computed) && computed > 0.01) {
      lastKnownPositiveTradeWithdrawableByKey.set(tradeValueCacheKey, computed);
      return computed;
    }

    // Settled empty REST — clear sticky so a real drain to ~0 still shows.
    if (
      modeKnown &&
      restWd != null &&
      restWd <= 0.01 &&
      tradingStateFetched &&
      !tradingStateFetching
    ) {
      lastKnownPositiveTradeWithdrawableByKey.delete(tradeValueCacheKey);
      return Math.max(0, computed);
    }

    // Transient WS/REST gap — keep last good transferable while sheet/UI is open.
    if (held != null && held > 0.01) {
      if (!streamHasAccountSnapshot || computed <= 0.01 || tradingStateFetching || !streamIsMasterBook) {
        return held;
      }
    }

    return Math.max(0, computed);
  }, [
    isDemo,
    queryIsPooledAccount,
    streamIsMasterBook,
    streamPerpWithdrawableUsd,
    streamHasAccountSnapshot,
    tradeValueCacheKey,
    tradingStateQuery,
    tradingStateFetched,
    tradingStateFetching,
  ]);

  // Raw string for Max button — uses main-dex withdrawable since the HL withdrawal flow only
  // withdraws from main perp (HIP-3 withdrawal requires a separate per-dex flow).
  const tradeWithdrawableRaw = useMemo(() => {
    // Keep FULL precision here (no toFixed(2)). The Max button truncates DOWN via
    // Math.floor(raw*100)/100; pre-rounding with toFixed(2) can round UP
    // (e.g. 12.80779938 -> "12.81") and push the requested amount above the real
    // on-chain balance, causing HL to reject with "Insufficient balance".
    if (queryIsPooledAccount) return String(tradeWithdrawableUsd);
    if (streamIsMasterBook) {
      const mainWd = stream.clearinghouseState?.withdrawable;
      const parsed = typeof mainWd === 'string' ? parseFloat(mainWd) : NaN;
      // Ignore "0" / empty mid-reconnect — sticky/REST tradeWithdrawableUsd is safer.
      if (typeof mainWd === 'string' && mainWd.length > 0 && Number.isFinite(parsed) && parsed > 0.01) {
        return mainWd;
      }
    }
    if (tradingStateQuery && Number.isFinite(tradingStateQuery.withdrawableUsd) && tradingStateQuery.withdrawableUsd > 0.01) {
      return String(tradingStateQuery.withdrawableUsd);
    }
    if (tradeWithdrawableUsd > 0.01) return String(tradeWithdrawableUsd);
    return String(streamPerpWithdrawableUsd);
  }, [
    queryIsPooledAccount,
    streamIsMasterBook,
    stream.clearinghouseState?.withdrawable,
    streamPerpWithdrawableUsd,
    tradeWithdrawableUsd,
    tradingStateQuery,
  ]);

  // Never blank the hero to "—" when we already have REST or a sticky total.
  // Loading only for the true cold start (no Main snapshot yet).
  const tradeLoading =
    !Number.isFinite(tradeAccountValueUsd) ||
    (tradeAccountValueUsd <= 0.01 &&
      !tradingStateQuery &&
      lastKnownPositiveTradeValueByKey.get(tradeValueCacheKey) == null &&
      (tradingStateFetching ||
        (streamIsMasterBook &&
          !stream.clearinghouseState &&
          (!stream.isConnected ||
            stream.connectionStatus === 'connecting' ||
            stream.connectionStatus === 'error'))));

  const refreshBalances = useCallback(async () => {
    if (!connectedAddress || !isAddress(connectedAddress)) return;

    setWalletError(null);
    // Only show loading indicator on initial load, not during auto-refresh
    if (isInitialLoadRef.current) {
      setWalletLoading(true);
    }

    try {
      const addr = connectedAddress as Hex;
      const [decimals, usdcBal] = await Promise.all([
        publicClient.readContract({ address: ARBITRUM_USDC, abi: ERC20_ABI, functionName: 'decimals' }),
        publicClient.readContract({ address: ARBITRUM_USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] }),
      ]);
      setUsdcDecimals(Number(decimals));
      setWalletUsdc(usdcBal);
    } catch (e: any) {
      setWalletError(e?.message ? String(e.message) : t('deposit.failedToLoadBalances'));
    } finally {
      setWalletLoading(false);
      isInitialLoadRef.current = false;
    }
  }, [connectedAddress, publicClient]);

  useEffect(() => {
    if (!isFocused) return;
    isInitialLoadRef.current = true;
    refreshBalances();
    const t = setInterval(refreshBalances, 30_000);
    return () => clearInterval(t);
  }, [isFocused, refreshBalances]);

  // Respond to external refresh trigger (e.g., after successful withdrawal)
  useEffect(() => {
    if (props.refreshTrigger && props.refreshTrigger > 0) {
      // Show loading state for this triggered refresh
      setWalletLoading(true);
      refreshBalances();
    }
  }, [props.refreshTrigger, refreshBalances]);

  // Banner confirmed an incoming credit landed on-chain — re-read the wallet
  // balance now so the card updates in lock-step with the banner clearing
  // (skip the very first run; nonce starts at 0 and there's nothing to sync).
  const prevWalletCreditNonceRef = useRef(walletCreditNonce);
  useEffect(() => {
    if (prevWalletCreditNonceRef.current === walletCreditNonce) return;
    prevWalletCreditNonceRef.current = walletCreditNonce;
    refreshBalances();
  }, [walletCreditNonce, refreshBalances]);

  // Restore in-flight incoming pills after remount (e.g. Profile → Home → Profile).
  useEffect(() => {
    if (!connectedAddress) return;
    let cancelled = false;
    void (async () => {
      const stored = await loadFundsPendingIncoming(connectedAddress);
      if (cancelled) return;
      if (stored.withdraw) {
        setPendingWithdraw({
          amount: stored.withdraw.amount,
          startedAt: stored.withdraw.startedAt,
          baselineWalletRaw:
            stored.withdraw.baselineWalletRaw != null
              ? BigInt(stored.withdraw.baselineWalletRaw)
              : null,
        });
        mirrorHlWithdraw({ amount: stored.withdraw.amount, startedAt: stored.withdraw.startedAt });
      }
      if (stored.deposit) {
        setPendingDeposit({
          amount: stored.deposit.amount,
          startedAt: stored.deposit.startedAt,
          baselineTradeUsd: stored.deposit.baselineTradeUsd,
        });
        mirrorHlDeposit({ amount: stored.deposit.amount, startedAt: stored.deposit.startedAt });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedAddress]);

  // Clear `pendingWithdraw` once the wallet balance actually moves past the
  // baseline (L1 USDC landed) or the safety TTL expires. HL withdraws take
  // ~2–3 min, so the safety clear sits at 5 min to cover slow blocks while
  // still preventing a stuck label if the user never came back.
  useEffect(() => {
    if (!pendingWithdraw) return;
    const baseline = pendingWithdraw.baselineWalletRaw;
    if (baseline != null && walletUsdc != null && walletUsdc > baseline) {
      setPendingWithdraw(null);
      mirrorHlWithdraw(null);
      if (connectedAddress) void saveFundsPendingWithdraw(connectedAddress, null);
      return;
    }
    const safetyMs = FUNDS_PENDING_WITHDRAW_TTL_MS;
    const elapsed = Date.now() - pendingWithdraw.startedAt;
    const remaining = Math.max(0, safetyMs - elapsed);
    const id = setTimeout(() => {
      setPendingWithdraw(null);
      mirrorHlWithdraw(null);
      if (connectedAddress) void saveFundsPendingWithdraw(connectedAddress, null);
    }, remaining);
    return () => clearTimeout(id);
  }, [pendingWithdraw, walletUsdc, connectedAddress]);

  // Same pattern for deposits: the trade-card label disappears as soon as
  // HL's WebSocket tick brings `tradeAccountValueUsd` meaningfully above
  // the submit-time baseline. A 1c epsilon guards against floating-point
  // drift between polls; the safety clear is 2 min since Arbitrum → HL
  // finality is typically ~15–45 s.
  useEffect(() => {
    if (!pendingDeposit) return;
    const depositNum = parseFloat(pendingDeposit.amount);
    const threshold = Number.isFinite(depositNum)
      ? pendingDeposit.baselineTradeUsd + Math.max(0.01, depositNum * 0.5)
      : pendingDeposit.baselineTradeUsd + 0.01;
    if (Number.isFinite(tradeAccountValueUsd) && tradeAccountValueUsd >= threshold) {
      setPendingDeposit(null);
      mirrorHlDeposit(null);
      if (connectedAddress) void saveFundsPendingDeposit(connectedAddress, null);
      return;
    }
    const safetyMs = FUNDS_PENDING_DEPOSIT_TTL_MS;
    const elapsed = Date.now() - pendingDeposit.startedAt;
    const remaining = Math.max(0, safetyMs - elapsed);
    const id = setTimeout(() => {
      setPendingDeposit(null);
      mirrorHlDeposit(null);
      if (connectedAddress) void saveFundsPendingDeposit(connectedAddress, null);
    }, remaining);
    return () => clearTimeout(id);
  }, [pendingDeposit, tradeAccountValueUsd, connectedAddress]);

  const walletUsdcFloat = useMemo(() => {
    if (walletUsdc === null) return null;
    try {
      return Number(formatUnits(walletUsdc, usdcDecimals));
    } catch {
      return null;
    }
  }, [walletUsdc, usdcDecimals]);

  // ─── Smart Account USDC recovery check ────────────────────────────────
  useEffect(() => {
    if (!smartWalletAddress || !isAddress(smartWalletAddress)) return;
    let cancelled = false;
    const checkSmartAccountBalance = async () => {
      try {
        const bal = await publicClient.readContract({
          address: ARBITRUM_USDC,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [smartWalletAddress as Hex],
        });
        if (!cancelled) setSmartAccountUsdc(bal);
      } catch {
        // silent
      }
    };
    checkSmartAccountBalance();
    return () => { cancelled = true; };
  }, [smartWalletAddress, publicClient, props.refreshTrigger]);

  const smartAccountUsdcFloat = useMemo(() => {
    if (smartAccountUsdc === 0n) return 0;
    return Number(formatUnits(smartAccountUsdc, 6));
  }, [smartAccountUsdc]);

  const handleRecoverSmartAccountUsdc = useCallback(async () => {
    if (!smartWalletClient || !smartWalletAddress || !connectedAddress || smartAccountUsdc === 0n) return;

    setIsRecovering(true);
    try {
      const eoaAddr = connectedAddress as Hex;

      // ERC20 transfer call: Smart Account → EOA
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [eoaAddr, smartAccountUsdc],
      });

      await smartWalletClient.sendTransaction({
        account: smartWalletClient.account,
        calls: [{ to: ARBITRUM_USDC as Hex, data: transferData }],
      });

      showSuccessToast(t('deposit.recoverySuccess', {
        amount: smartAccountUsdcFloat.toFixed(2),
      }));
      setSmartAccountUsdc(0n);
      // Refresh EOA balance after short delay
      setTimeout(() => refreshBalances(), 3000);
    } catch (e: any) {
      const msg = String(e?.message || 'Recovery failed');
      showErrorToast(msg, t('deposit.recoveryFailed'));
    } finally {
      setIsRecovering(false);
    }
  }, [smartWalletClient, smartWalletAddress, connectedAddress, smartAccountUsdc, smartAccountUsdcFloat, refreshBalances, t]);

  const handleManualRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastManualRefresh.current < REFRESH_COOLDOWN_MS || isRefreshingManual.current) return;
    lastManualRefresh.current = now;
    isRefreshingManual.current = true;

    spinAnim.setValue(0);
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }),
    ).start();

    try {
      // Trade balance is driven by the HL WebSocket; wallet USDC is on-chain.
      stream.reconnect();
      await refreshBalances();
    } finally {
      isRefreshingManual.current = false;
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [refreshBalances, spinAnim, stream.reconnect]);

  const copyAddress = useCallback(async () => {
    if (!connectedAddress) return;
    await Clipboard.setStringAsync(connectedAddress);
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setDepositAddressCopied(true);
    if (depositAddressCopyTimerRef.current) clearTimeout(depositAddressCopyTimerRef.current);
    depositAddressCopyTimerRef.current = setTimeout(() => setDepositAddressCopied(false), COPY_FEEDBACK_MS);
  }, [connectedAddress]);

  useEffect(() => {
    if (depositModalOpen) return;
    setDepositAddressCopied(false);
    if (depositAddressCopyTimerRef.current) {
      clearTimeout(depositAddressCopyTimerRef.current);
      depositAddressCopyTimerRef.current = null;
    }
  }, [depositModalOpen]);

  useEffect(() => {
    return () => {
      if (depositAddressCopyTimerRef.current) clearTimeout(depositAddressCopyTimerRef.current);
    };
  }, []);

  const showDepositPopup = useCallback(() => {
    if (!connectedAddress) return;
    setDepositModalOpen(true);
  }, [connectedAddress]);

  /** Top up wallet USDC (address). */
  const handleAddUsdcPress = useCallback(() => {
    if (!connectedAddress) return;
    showDepositPopup();
  }, [connectedAddress, showDepositPopup]);

  const setQuickAmount = useCallback(
    (fraction: number) => {
      if (walletUsdcFloat === null) return;
      const amt = Math.max(0, walletUsdcFloat * fraction);
      // Truncate DOWN to 2 decimals so "Max" never exceeds actual balance
      const truncated = Math.floor(amt * 100) / 100;
      setDepositAmount(truncated.toFixed(2));
    },
    [walletUsdcFloat]
  );

  const setQuickWithdrawFraction = useCallback(
    (fraction: number) => {
      setWithdrawAmount((tradeWithdrawableUsd * fraction).toFixed(2));
    },
    [tradeWithdrawableUsd],
  );

  const handleWithdrawMax = useCallback(() => {
    const raw = parseFloat(tradeWithdrawableRaw);
    if (Number.isFinite(raw) && raw > 0) {
      const truncated = Math.floor(raw * 100) / 100;
      setWithdrawAmount(truncated.toFixed(2));
    }
  }, [tradeWithdrawableRaw]);

  const MIN_USDC = 5;
  const depositAmountNum = useMemo(() => {
    const n = Number(depositAmount.trim());
    return Number.isFinite(n) ? n : NaN;
  }, [depositAmount]);

  const isMinNotMet = Number.isFinite(depositAmountNum) && depositAmountNum > 0 && depositAmountNum < MIN_USDC;
  const isInsufficientWallet =
    Number.isFinite(depositAmountNum) &&
    depositAmountNum > 0 &&
    walletUsdcFloat !== null &&
    depositAmountNum > walletUsdcFloat + 1e-9;

  const canSubmitTransfer =
    !isDepositing &&
    !!connectedWallet &&
    !!connectedAddress &&
    isAddress(connectedAddress) &&
    Number.isFinite(depositAmountNum) &&
    depositAmountNum >= MIN_USDC &&
    (walletUsdcFloat === null || depositAmountNum <= walletUsdcFloat + 1e-9);

  const withdrawAmountNum = useMemo(() => {
    const n = Number(withdrawAmount.trim());
    return Number.isFinite(n) ? n : NaN;
  }, [withdrawAmount]);

  const isInsufficientTrade =
    Number.isFinite(withdrawAmountNum) &&
    withdrawAmountNum > 0 &&
    Number.isFinite(tradeWithdrawableUsd) &&
    withdrawAmountNum > tradeWithdrawableUsd + 0.01; // Allow small rounding differences (0.01 USDC tolerance)

  const canWithdraw =
    !isWithdrawing &&
    !!connectedWallet &&
    !!connectedAddress &&
    isAddress(connectedAddress) &&
    withdrawAmount.trim().length > 0 &&
    Number.isFinite(withdrawAmountNum) &&
    withdrawAmountNum > 0 &&
    !isInsufficientTrade;

  const handleWithdraw = useCallback(async () => {
    if (!connectedWallet || !connectedAddress || !isAddress(connectedAddress)) {
      showToast(t('deposit.noEmbeddedWallet'));
      return;
    }
    const amtStr = withdrawAmount.trim();
    const amt = Number(amtStr);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast(t('deposit.invalidAmount'));
      return;
    }

    const confirmed = await requestConfirm(
      t('deposit.confirmTransferTitle'),
      t('deposit.confirmToWallet', { amount: amtStr }),
    );
    if (!confirmed) return;

    setIsWithdrawing(true);
    // Snapshot BEFORE the HL call so the wallet-card "Incoming" label is up
    // the moment the user confirms. Baseline balance lets us auto-clear the
    // label as soon as the L1 receipt lands (whatever minute that is).
    const withdrawStartedAt = Date.now();
    setPendingWithdraw({
      amount: amtStr,
      startedAt: withdrawStartedAt,
      baselineWalletRaw: walletUsdc,
    });
    mirrorHlWithdraw({ amount: amtStr, startedAt: withdrawStartedAt });
    if (connectedAddress) {
      void saveFundsPendingWithdraw(connectedAddress, {
        amount: amtStr,
        startedAt: withdrawStartedAt,
        baselineWalletRaw: walletUsdc?.toString() ?? null,
      });
    }
    try {
      const provider = await connectedWallet.getProvider();
      // External wallets: park MetaMask on Arbitrum before withdraw3 so the
      // EIP-712 prompt isn't rejected (same treatment as seamless setup).
      // No-op for embedded Privy wallets (no WalletConnect session).
      await ensureExternalWalletOnHlSigningChain();
      await withdrawFromHyperliquid({
        userWalletProvider: provider,
        userAddress: connectedAddress as Hex,
        destination: connectedAddress as Hex,
        amountUsd: amtStr,
      });
      
      // Track as pending transaction (no Arbitrum hash for HL withdrawals, use timestamp as ID)
      const pendingId = `hl-withdraw-${Date.now()}`;
      savePendingTransaction({
        hash: pendingId,
        type: 'withdraw',
        amount: amtStr,
        timestamp: Date.now(),
        from: connectedAddress,
        to: connectedAddress,
        description: 'Withdrawing to Wallet',
      });
      
      //showSuccessToast(t('deposit.withdrawalRequested'), undefined, HL_TRADE_TO_WALLET_SUCCESS_TOAST_MS);
      playConfetti('cash');
      
      // Track withdrawal with Firebase Analytics
      Analytics.logWithdrawal(amt);
      
      setWithdrawAmount('');
    } catch (e: any) {
      let msg = String(e?.shortMessage || e?.message || t('deposit.withdrawFailed'));
      // Make nonce errors more user-friendly
      if (msg.toLowerCase().includes('nonce') || msg.toLowerCase().includes('already in progress')) {
        msg = t('deposit.waitMomentTryAgain');
      }
      showErrorToast(msg, t('deposit.withdrawFailed'));
      // HL rejected the withdraw — clear the optimistic pending label so the
      // user isn't misled into thinking funds are in-flight.
      setPendingWithdraw(null);
      mirrorHlWithdraw(null);
      if (connectedAddress) void saveFundsPendingWithdraw(connectedAddress, null);
    } finally {
      setIsWithdrawing(false);
    }
  }, [connectedWallet, connectedAddress, withdrawAmount, walletUsdc, t]);

  const handleMoveToTrading = useCallback(async () => {
    if (!connectedWallet || !connectedAddress || !isAddress(connectedAddress)) {
      showToast(t('deposit.noEmbeddedWallet'));
      return;
    }

    const amtStr = depositAmount.trim();
    if (!amtStr) return showToast(t('deposit.enterAmount'));

    const amt = Number(amtStr);
    if (!Number.isFinite(amt) || amt <= 0) return showToast(t('deposit.invalidAmount'));

    // Bridge2 minimum per docs: 5 USDC
    if (amt < MIN_USDC) return showToast(t('deposit.minimumUsdc', { min: MIN_USDC }));

    if (walletUsdcFloat !== null && amt > walletUsdcFloat + 1e-9) {
      return showToast(t('deposit.insufficientUsdc'));
    }

    const confirmed = await requestConfirm(
      t('deposit.confirmTransferTitle'),
      t('deposit.confirmToTrade', { amount: amtStr }),
    );
    if (!confirmed) return;

    setIsDepositing(true);
    setLastTransferError(null);
    try {
      const provider = await connectedWallet.getProvider();

      // Ensure Arbitrum (signature domain chainId must match)
      // Some providers expect `params` even for param-less methods.
      const chainIdHex = (await provider.request({ method: 'eth_chainId', params: [] })) as string;
      const chainId = parseInt(chainIdHex, 16);
      if (chainId !== ARBITRUM_CHAIN_ID) {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
        });
      }

      const amountBaseUnits = parseUnits(amtStr, usdcDecimals);
      const from = connectedAddress as Hex;
      // Permit-only deposit via backend relayer (gasless for user).
      try {
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
        const nonce = await publicClient.readContract({
          address: ARBITRUM_USDC,
          abi: ERC20_ABI,
          functionName: 'nonces',
          args: [from],
        });

        const typedData = {
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' },
            ],
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'Permit',
          domain: {
            name: 'USD Coin',
            version: '2',
            chainId: ARBITRUM_CHAIN_ID,
            verifyingContract: ARBITRUM_USDC,
          },
          message: {
            owner: from,
            spender: HL_BRIDGE2,
            value: amountBaseUnits.toString(),
            nonce: nonce.toString(),
            deadline: String(deadline),
          },
        };

        const signature = (await provider.request({
          method: 'eth_signTypedData_v4',
          params: [from, JSON.stringify(typedData)],
        })) as string;

        // Get Privy access token for authenticated API call
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error('Authentication required. Please log in again.');
        }

        const res = await depositWithPermit(
          {
            user: from,
            usd: amountBaseUnits.toString(),
            deadline,
            signature,
          },
          accessToken
        );

        const txHashRaw = res?.txHash as string | undefined;
        if (!txHashRaw) {
          throw new Error('Relayer did not return txHash');
        }
        const txHash = (txHashRaw.startsWith('0x') ? txHashRaw : `0x${txHashRaw}`) as Hex;

        lastTxHashRef.current = txHash;
        
        // Track as pending transaction
        savePendingTransaction({
          hash: txHash,
          type: 'deposit',
          amount: amtStr,
          timestamp: Date.now(),
          from: from,
          description: 'Depositing to Trade Balance',
        });

        // Only surface the trade-card "incoming" label once we have a real
        // tx hash (broadcast accepted), not on confirm. Baseline the trade
        // balance so the label stays up until HL's WS delivers the higher
        // value — `refreshBalances()` only touches the wallet-side USDC,
        // so clearing the label via handler `finally` was too early.
        const baselineTradeUsd = Number.isFinite(tradeAccountValueUsd)
          ? tradeAccountValueUsd
          : 0;
        const depositStartedAt = Date.now();
        setPendingDeposit({
          amount: amtStr,
          startedAt: depositStartedAt,
          baselineTradeUsd,
        });
        mirrorHlDeposit({ amount: amtStr, startedAt: depositStartedAt });
        if (connectedAddress) {
          void saveFundsPendingDeposit(connectedAddress, {
            amount: amtStr,
            startedAt: depositStartedAt,
            baselineTradeUsd,
          });
        }

        await publicClient.waitForTransactionReceipt({ hash: txHash });
        //showSuccessToast(t('deposit.movedToTrading', { amount: amtStr }));
        playConfetti('candles');
        
        // Track deposit with Firebase Analytics
        Analytics.logDeposit(amt);
        
        setDepositAmount('');
        await refreshBalances();
        return;
      } catch (e: any) {
        const detail = e?.response?.data?.detail;
        const msg = String(detail || e?.message || e?.shortMessage || t('deposit.gaslessTransferUnavailable'));
        setLastTransferError(msg);
        showErrorToast(msg, t('deposit.transferUnavailable'));
        return;
      }
    } catch (e: any) {
      const msg = String(e?.shortMessage || e?.message || t('deposit.moveFailed'));
      setLastTransferError(msg);
      showErrorToast(msg, t('deposit.transferFailed'));
      // Clear any optimistic pending label if the deposit never broadcast.
      // In the success path the label is intentionally kept — the auto-clear
      // effect below drops it once HL's WS reflects the higher trade balance.
      setPendingDeposit(null);
      mirrorHlDeposit(null);
      if (connectedAddress) void saveFundsPendingDeposit(connectedAddress, null);
    } finally {
      setIsDepositing(false);
    }
  }, [connectedWallet, connectedAddress, depositAmount, publicClient, refreshBalances, tradeAccountValueUsd, usdcDecimals, walletUsdcFloat, t]);

  const showProfileWalletHeader = props.onOpenWalletQr != null || !!props.profileEmail;

  const { data: onboardingAccountInfo } = useQuery({
    queryKey: [ONBOARDING_ACCOUNT_INFO_QUERY_KEY, user?.id],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return { created_at: null as string | null, avatar_url: null, has_avatar: false };
      return fetchOnboardingAccountInfo(token);
    },
    enabled: showProfileWalletHeader && !!user?.id,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const accountCreatedAt = useMemo(() => {
    if (onboardingAccountInfo?.created_at) return onboardingAccountInfo.created_at;
    return props.accountCreatedAtFallback ?? null;
  }, [onboardingAccountInfo?.created_at, props.accountCreatedAtFallback]);

  const showProfileAccountInfo =
    showProfileWalletHeader && (!!connectedAddress || !!props.profileEmail || !!accountCreatedAt);

  /** Muted fiat estimate under the USDC wallet balance — always shown (USDC ≠ fiat).
   *  Renders a fixed-height placeholder while loading so the card never grows
   *  after mount (prevents the profile-open height jump). */
  const walletFiatEstimateEl =
    walletUsdcFloat === null || walletLoading ? (
      <View style={styles.localBalanceDots} />
    ) : isConverted && isDisplayCurrencyLoading ? (
      <BouncingDots
        color={colors.text.tertiary}
        dotSize={5}
        pulse
        style={styles.localBalanceDots}
      />
    ) : (
      <Text
        style={styles.localBalanceText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {formatWalletFiatEstimate(walletUsdcFloat)}
      </Text>
    );

  return (
    <View style={[styles.root, showProfileWalletHeader && styles.rootProfileFunds]}>
      <Modal visible={depositModalOpen} transparent animationType="fade" onRequestClose={() => setDepositModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.addUsdcModalCard]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('deposit.depositUsdc')}</Text>
              <TouchableOpacity onPress={() => setDepositModalOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.addUsdcModalScroll}
              contentContainerStyle={styles.addUsdcModalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.depositOptionSection, { marginTop: 12 }]}>
                <Text style={styles.depositOptionTitle}>{t('deposit.transferFromWallet')}</Text>
                <Text style={styles.depositOptionDesc}>
                  {t('deposit.sendUsdcArbitrumPrefix')}
                  <Text style={styles.depositArbitrumNetworkAccent}>{t('deposit.sendUsdcArbitrumNetwork')}</Text>
                  {t('deposit.sendUsdcArbitrumSuffix')}
                </Text>
                {connectedAddress ? (
                  <View style={styles.addUsdcQrWrap}>
                    <QRCodeStyled
                      data={connectedAddress}
                      style={styles.addUsdcQrCode}
                      pieceSize={5}
                      color="#000000"
                      pieceCornerType="rounded"
                      pieceBorderRadius={2}
                      isPiecesGlued
                      padding={12}
                      outerEyesOptions={{
                        topLeft: { borderRadius: 6 },
                        topRight: { borderRadius: 6 },
                        bottomLeft: { borderRadius: 6 },
                      }}
                      innerEyesOptions={{ borderRadius: 3 }}
                    />
                  </View>
                ) : null}
                {connectedAddress ? (
                  <View style={styles.depositAddressPill}>
                    <View style={styles.depositArbIconWrap}>
                      <Image source={ARBITRUM_PILL_ICON} style={styles.depositArbIcon} resizeMode="contain" />
                    </View>
                    <Text style={styles.depositAddressFull} selectable numberOfLines={2}>
                      {connectedAddress}
                    </Text>
                    <TouchableOpacity
                      onPress={() => void copyAddress()}
                      style={styles.depositWalletIconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.copyAddress')}
                    >
                      <Ionicons
                        name={depositAddressCopied ? 'checkmark' : 'copy-outline'}
                        size={14}
                        color={depositAddressCopied ? colors.accent.gold : colors.text.tertiary}
                      />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={!!infoModal} transparent animationType="fade" onRequestClose={() => setInfoModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{infoModal?.title ?? ''}</Text>
              <TouchableOpacity onPress={() => setInfoModal(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalText}>{infoModal?.body ?? ''}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={() => setInfoModal(null)}>
                <Text style={styles.modalPrimaryText}>{t('common.gotIt')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TradeTransferBottomSheet
        visible={expandedTransfer !== null && !isDemo}
        onClose={() => setExpandedTransfer(null)}
        direction={expandedTransfer ?? 'toTrade'}
        onDirectionChange={setExpandedTransfer}
        isDepositing={isDepositing}
        isWithdrawing={isWithdrawing}
        depositAmount={depositAmount}
        onDepositAmountChange={setDepositAmount}
        walletUsdcFloat={walletUsdcFloat}
        onQuickDepositFraction={setQuickAmount}
        canSubmitTransfer={canSubmitTransfer}
        onMoveToTrading={handleMoveToTrading}
        lastTransferError={lastTransferError}
        isMinNotMet={isMinNotMet}
        isInsufficientWallet={isInsufficientWallet}
        withdrawAmount={withdrawAmount}
        onWithdrawAmountChange={setWithdrawAmount}
        tradeWithdrawableUsd={tradeWithdrawableUsd}
        onQuickWithdrawFraction={setQuickWithdrawFraction}
        onWithdrawMax={handleWithdrawMax}
        canWithdraw={canWithdraw}
        onWithdraw={handleWithdraw}
        isInsufficientTrade={isInsufficientTrade}
        confirmOpen={!!confirmModal}
        confirmTitle={confirmModal?.title ?? ''}
        confirmMessage={confirmModal?.message ?? ''}
        onConfirmYes={handleConfirmYes}
        onConfirmNo={handleConfirmNo}
      />

      {/* DEV ONLY — remove before release 
      {__DEV__ && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          <TouchableOpacity onPress={() => playConfetti('candles')} style={{ backgroundColor: '#333', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Test Candles</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => playConfetti('cash')} style={{ backgroundColor: '#333', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Test Cash</Text>
          </TouchableOpacity>
        </View>
      )}*/}

      {!showProfileWalletHeader ? (
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>{t('deposit.funds')}</Text>
          <TouchableOpacity onPress={handleManualRefresh} style={styles.iconButton} disabled={isDepositing}>
            <Animated.View style={{ transform: [{ rotate: spinInterpolation }] }}>
              <Ionicons name="refresh" size={18} color={colors.text.secondary} />
            </Animated.View>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Smart Account USDC Recovery Banner ── */}
      {smartAccountUsdcFloat > 0.01 && (
        <View style={styles.recoveryBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recoveryTitle}>
              <Ionicons name="warning-outline" size={14} color={colors.status.warning} />{' '}
              {t('deposit.stuckFundsTitle')}
            </Text>
            <Text style={styles.recoveryDesc}>
              {t('deposit.stuckFundsDesc', { amount: smartAccountUsdcFloat.toFixed(2) })}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.recoveryBtn, isRecovering && { opacity: 0.6 }]}
            onPress={handleRecoverSmartAccountUsdc}
            disabled={isRecovering}
          >
            {isRecovering ? (
              <ActivityIndicator size="small" color={colors.background.primary} />
            ) : (
              <Text style={styles.recoveryBtnText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t('deposit.recoverFunds')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Wallet hub — EOA funds trade on Hyperliquid. */}
      <View style={fundsOnboardingStep === 2 ? styles.fundsOnboardingDim : undefined}>
      <LinearGradient
        colors={PROFILE_FUNDS_GRADIENT}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientFundsCard, styles.walletHubCard, showProfileWalletHeader && styles.walletHubCardProfile]}
      >
        <View style={styles.ticketRail} pointerEvents="none" />
        {showProfileWalletHeader ? <WalletHubCardArt /> : null}
        <View style={showProfileWalletHeader ? styles.walletHubBody : undefined}>
        {showProfileWalletHeader ? (
          <View style={styles.walletHubCentered}>
            {showProfileAccountInfo || props.onOpenWalletQr ? (
              <View style={styles.walletHubIdentityRow}>
                <ProfileAvatar size={48} editable />
                <View style={styles.accountInfoChip}>
                  {props.onOpenWalletQr ? (
                    <TouchableOpacity
                      style={styles.accountInfoChipQrZone}
                      onPress={props.onOpenWalletQr}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={t('profile.walletAddress')}
                    >
                      <Ionicons name="qr-code-outline" size={18} color={colors.accent.goldDark} />
                    </TouchableOpacity>
                  ) : null}
                  {props.onOpenWalletQr && showProfileAccountInfo ? (
                    <View style={styles.accountInfoChipDivider} />
                  ) : null}
                  {showProfileAccountInfo ? (
                    <TouchableOpacity
                      style={styles.accountInfoChipMainZone}
                      onPress={() => setAccountInfoOpen(true)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={t('cash.accountInfoA11y')}
                    >
                      <Text style={styles.accountInfoChipText}>{t('cash.accountInfo')}</Text>
                      <Ionicons name="chevron-forward" size={13} color={colors.text.tertiary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.cardLabelRow, styles.walletHubCenteredLabel]}
              onPress={() =>
                setInfoModal({
                  title: t('deposit.walletBalance'),
                  body: t('deposit.walletBalanceInfoNoBank'),
                })
              }
              activeOpacity={0.8}
            >
              <View style={styles.iconWrapper}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.text.tertiary} />
              </View>
              <Text style={styles.walletHubLabelText} numberOfLines={1}>
                {t('deposit.walletBalance')}
              </Text>
              {/* Mirror the info icon so the title sits on the card midline. */}
              <View style={styles.iconWrapper} pointerEvents="none" />
            </TouchableOpacity>

            <View style={styles.walletHubHeroBlock}>
              <View style={styles.walletHubHeroRow}>
                <Image source={USDC_ICON} style={styles.walletHubHeroIcon} />
                <View style={styles.walletHubHeroAmountWrap}>
                  <View style={styles.tweenedBalanceRow}>
                    {walletLoading || walletUsdcFloat === null ? (
                      <BouncingDots
                        color={colors.text.primary}
                        dotSize={8}
                        pulse
                        style={styles.walletHubHeroDots}
                      />
                    ) : (
                      <RollingNumber
                        value={walletUsdcFloat}
                        format={formatBalanceAmount}
                        emptyText={BALANCE_EMPTY}
                        align="center"
                        style={styles.walletHubHeroBalance}
                      />
                    )}
                    {/*<Text style={styles.walletHubHeroUnit}> {t('common.USDC')}</Text>*/}
                  </View>
                </View>
                {SHOW_PROFILE_WALLET_REFRESH ? (
                  <TouchableOpacity
                    onPress={handleManualRefresh}
                    style={styles.walletHubRefreshInline}
                    disabled={isDepositing}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh balances"
                  >
                    <Animated.View style={{ transform: [{ rotate: spinInterpolation }] }}>
                      <Ionicons name="refresh" size={15} color={colors.text.tertiary} />
                    </Animated.View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.walletHubHeroIcon} pointerEvents="none" />
                )}
              </View>

              {walletFiatEstimateEl}
            </View>

          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.cardLabelRow}
              onPress={() =>
                setInfoModal({
                  title: t('deposit.walletBalance'),
                  body: t('deposit.walletBalanceInfoNoBank'),
                })
              }
              activeOpacity={0.8}
            >
              <View style={styles.iconWrapper}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.text.tertiary} />
              </View>
              <Text style={styles.balanceCardLabelOnGradient} numberOfLines={1}>
                {t('deposit.walletBalance')}
              </Text>
            </TouchableOpacity>
            <View style={styles.amountRowInline}>
              <Image source={USDC_ICON} style={styles.usdcIcon} />
              <View style={styles.balanceValueRow}>
                <View style={styles.tweenedBalanceRow}>
                  <TweenedStatText
                    value={walletLoading ? null : walletUsdcFloat}
                    format={formatBalanceAmount}
                    emptyText={BALANCE_EMPTY}
                    style={[styles.balanceBigOnGradient, styles.tweenedBalanceShrink]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                  />
                  <Text style={styles.balanceBigUnitOnGradient}> {t('common.USDC')}</Text>
                </View>
              </View>
            </View>
            {walletFiatEstimateEl}
          </>
        )}
        <View style={[styles.walletHubDepositWrap, showProfileWalletHeader && styles.walletHubDepositWrapProfile]}>
          {props.highlightDeposit && (
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 12,
                borderWidth: 2.5,
                borderColor: colors.accent.gold,
                transform: [{ scale: depositPulseScale }],
                opacity: depositPulseOpacity,
              }}
              pointerEvents="none"
            />
          )}
          <View style={styles.walletHubActionRow}>
            <TouchableOpacity
              style={styles.walletHubActionHalf}
              onPress={handleAddUsdcPress}
              disabled={!connectedAddress}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.accent.gold, colors.accent.goldDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.depositBtnBelowNoMargin}
              >
                <Ionicons name="download-outline" size={16} color="#FFFFFF" style={styles.depositBtnIcon} />
                <Text style={styles.depositBtnBelowText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.69}>
                  {t('deposit.depositUsdc')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.walletHubActionHalf, styles.walletHubTransferBtn]}
              onPress={() => setExpandedTransfer((v) => (v ? null : 'toTrade'))}
              disabled={!connectedAddress || isDepositing || isWithdrawing || isDemo}
              activeOpacity={0.85}
            >
              <Ionicons name="swap-vertical" size={16} color={colors.accent.goldDark} />
              <Text style={styles.walletHubTransferBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.69}>
                {t('deposit.move')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {!!walletError && <Text style={styles.errorText}>{walletError}</Text>}
        </View>
      </LinearGradient>
      </View>
      {props.profileOnboardingTooltipPlacement === 'wallet' ? props.profileOnboardingTooltip : null}

      {!isDemo ? (
        <>
          <View style={fundsOnboardingStep === 1 ? styles.fundsOnboardingDim : undefined}>
            <FundsTransferBridge
              activeTarget={bridgeActiveTarget}
              activeDirection={bridgeActiveDirection}
              showBankRail={false}
            />
          </View>
          <View
            style={fundsOnboardingStep === 1 ? styles.fundsOnboardingDim : undefined}
          >
          <View
            ref={props.destinationRowRef}
            collapsable={false}
            style={[styles.destinationRow, styles.destinationRowTradeOnly]}
          >
            {/* Trade */}
            <View style={styles.destinationCardWrap}>
              {props.highlightTrade ? (
                <Animated.View
                  style={[
                    styles.destinationPulseRing,
                    { transform: [{ scale: destinationPulseScale }], opacity: destinationPulseOpacity },
                  ]}
                  pointerEvents="none"
                />
              ) : null}
            <LinearGradient
              colors={PROFILE_DESTINATION_FUNDS_GRADIENT}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.gradientFundsCard,
                styles.destinationCard,
                styles.destinationCardTradeOnly,
              ]}
            >
              <View style={styles.ticketRail} pointerEvents="none" />
              <TouchableOpacity
                style={[styles.cardLabelRow, styles.cardLabelRowTradeOnly]}
                onPress={() =>
                  setInfoModal({
                    title: t('deposit.tradeBalance'),
                    body: queryIsPooledAccount
                      ? t(
                          'deposit.tradeBalanceInfo',
                          'Your USDC is unified across spot, main perps, and HIP-3 perps, so manual spot/perp transfers are not needed.',
                        )
                      : (
                        <>
                          {t('deposit.tradeBalanceInfoNoBank')}{' '}
                          <Text style={{ color: colors.accent.gold, fontWeight: '700' }}>{t('deposit.moveUsdcPerp')}</Text>
                        </>
                      ),
                  })
                }
                activeOpacity={0.8}
              >
                <View style={styles.iconWrapper}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.text.tertiary} />
                </View>
                <Text
                  style={[styles.balanceCardLabelOnGradient, styles.balanceCardLabelTradeOnly]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {t('deposit.tradeBalance')}
                </Text>
                <View style={styles.iconWrapper} pointerEvents="none" />
              </TouchableOpacity>
              <View style={[styles.amountRowInline, styles.amountRowTradeOnly]}>
                <Image source={USDC_ICON} style={styles.tradeOnlyBalanceIcon} />
                <View style={[styles.balanceValueRow, styles.balanceValueRowTradeOnly]}>
                  {isDisplayCurrencyLoading && !tradeLoading && tradeAccountValueUsd !== null ? (
                    <BouncingDots
                      color={colors.text.primary}
                      dotSize={4}
                      pulse
                      style={StyleSheet.flatten([styles.bankBalanceDots, styles.bankBalanceDotsTradeOnly])}
                    />
                  ) : (
                    <RollingNumber
                      value={tradeLoading ? null : tradeAccountValueUsd}
                      format={formatDisplayPrice}
                      emptyText={BALANCE_EMPTY}
                      align="center"
                      style={styles.tradeOnlyBalance}
                    />
                  )}
                </View>
                <View style={styles.tradeOnlyBalanceIcon} pointerEvents="none" />
              </View>
              <Text
                style={[styles.tradeSubOnGradient, styles.tradeSubTradeOnly]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {tradeLoading
                  ? t('deposit.loading')
                  : `${t('deposit.transferable', 'Transferable:')} $${(Math.floor(tradeWithdrawableUsd * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Text>
              <TouchableOpacity
                style={[styles.moveOutlineBtn, styles.moveOutlineBtnTradeOnly]}
                onPress={() => setExpandedTransfer((v) => (v ? null : 'toTrade'))}
                disabled={isDepositing || isWithdrawing}
                activeOpacity={0.85}
              >
                <Ionicons name="swap-vertical" size={14} color={colors.accent.goldDark} />
                <Text style={styles.moveOutlineBtnText} numberOfLines={1}>
                  {t('deposit.move')}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
            </View>
          </View>
          {props.profileOnboardingTooltipPlacement === 'destination' ? props.profileOnboardingTooltip : null}
          </View>
        </>
      ) : (
        /* Demo: trade-only tile (testnet HL — no bank rail). */
        <LinearGradient
          colors={PROFILE_DESTINATION_FUNDS_GRADIENT}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientFundsCard}
        >
          <View style={styles.ticketRail} pointerEvents="none" />
          <TouchableOpacity
            style={styles.cardLabelRow}
            onPress={() =>
              setInfoModal({
                title: t('demo.demoBalanceLabel'),
                body: t('deposit.tradeBalanceInfoNoBank'),
              })
            }
            activeOpacity={0.8}
          >
            <View style={styles.iconWrapper}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.text.tertiary} />
            </View>
            <Text style={styles.balanceCardLabelOnGradient} numberOfLines={1}>
              {t('demo.demoBalanceLabel')}
            </Text>
          </TouchableOpacity>
          <View style={styles.amountRowInline}>
            <Image source={USDC_ICON} style={styles.usdcIcon} />
            <View style={styles.balanceValueRow}>
              {isDisplayCurrencyLoading && !tradeLoading && tradeAccountValueUsd !== null ? (
                <BouncingDots
                  color={colors.text.primary}
                  dotSize={4}
                  pulse
                  style={styles.bankBalanceDots}
                />
              ) : (
                <TweenedStatText
                  value={tradeLoading ? null : tradeAccountValueUsd}
                  format={formatDisplayPrice}
                  emptyText={BALANCE_EMPTY}
                  style={[styles.balanceBigOnGradient, styles.tweenedBalanceShrink]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                />
              )}
            </View>
          </View>
        </LinearGradient>
      )}

      {/*
        IMPORTANT: do NOT wrap this in <Modal>. RN's Modal is a separate native
        window (iOS UIViewController / Android Dialog) that intercepts every
        touch behind it for as long as it's mounted, regardless of whether the
        inner View has pointerEvents="none". That meant the user couldn't scroll
        the profile page while the lottie was playing (~1–2s). A regular
        absolute-positioned View with pointerEvents="none" lets touches fall
        through to the ScrollView underneath while the confetti still renders.
      */}
      {activeConfetti && (
        <View style={styles.confettiOverlay} pointerEvents="none">
          <LottieView
            ref={confettiRef}
            source={activeConfetti === 'candles' ? CANDLES_CONFETTI : CASH_CONFETTI}
            autoPlay={false}
            loop={false}
            resizeMode="cover"
            onAnimationFinish={onConfettiFinish}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      <ProfileAccountInfoSheet
        visible={accountInfoOpen}
        onClose={() => setAccountInfoOpen(false)}
        email={props.profileEmail}
        walletAddress={connectedAddress}
        accountCreatedAt={accountCreatedAt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  rootProfileFunds: { marginTop: 12, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.text.tertiary, textTransform: 'uppercase', paddingLeft: 4 },
  iconButton: { padding: 6 },
  /** Narrow column headers — single line; long i18n shrinks via adjustsFontSizeToFit */
  balanceCardLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    paddingVertical: 0,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 22,
  },
  iconWrapper: { justifyContent: 'center', alignItems: 'center', width: 18, height: 20 },
  errorText: { marginTop: 10, fontSize: 12, color: colors.status.warning, textAlign: 'center' },
  walletHint: { marginTop: 10, fontSize: 12, color: colors.text.tertiary, lineHeight: 18 },
  loadingText: { fontSize: 13, color: colors.text.secondary },
  /** Same wrapper on both balance cards so title rows share identical layout metrics */
  walletTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 22,
  },
  depositBtnBelow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
  },
  depositBtnBelowNoMargin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    minHeight: 44,
  },
  depositBtnIcon: { flexShrink: 0 },
  depositBtnBelowText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    flexShrink: 1,
    textAlign: 'center',
  },
  gradientFundsCard: {
    borderRadius: 16,
    padding: 14,
    paddingLeft: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    backgroundColor: colors.background.card,
    shadowColor: '#15803D',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  ticketRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: colors.accent.goldDark,
  },
  walletHubCard: {
    paddingTop: 14,
    paddingBottom: 14,
  },
  walletHubCardProfile: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingLeft: 20,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  walletHubBody: {
    position: 'relative',
    zIndex: 1,
  },
  walletHubCentered: {
    position: 'relative',
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  walletHubRefreshInline: {
    flexShrink: 0,
    padding: 4,
    marginLeft: 2,
  },
  walletHubCenteredLabel: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  walletHubLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  walletHubHeroBlock: {
    alignItems: 'center',
    width: '100%',
  },
  walletHubHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 4,
  },
  walletHubHeroIcon: {
    width: 24,
    height: 24,
    borderRadius: 999,
    flexShrink: 0,
  },
  walletHubHeroAmountWrap: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    alignItems: 'center',
  },
  walletHubHeroBalance: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  walletHubHeroDots: {
    minHeight: 33,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Banking off: Trade figure sits under Main wallet — keep it clearly secondary. */
  tradeOnlyBalance: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  tradeOnlyBalanceIcon: {
    width: 20,
    height: 20,
    borderRadius: 999,
    flexShrink: 0,
  },
  walletHubHeroUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  walletHubIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    marginBottom: 8,
    overflow: 'visible',
  },
  accountInfoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    overflow: 'hidden',
  },
  accountInfoChipQrZone: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfoChipDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#86EFAC',
    marginVertical: 7,
  },
  accountInfoChipMainZone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 12,
    paddingRight: 11,
    paddingVertical: 9,
  },
  accountInfoChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent.goldDark,
  },
  walletHubDepositWrap: { position: 'relative', marginTop: 10 },
  walletHubDepositWrapProfile: { marginTop: 16 },
  walletHubActionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  walletHubActionHalf: {
    flex: 1,
    minWidth: 0,
  },
  /** Matches Trade card Transfer outline so both CTAs read as a pair. */
  walletHubTransferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.accent.gold,
    backgroundColor: '#F0FDF4',
  },
  walletHubTransferBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent.goldDark,
    flexShrink: 1,
    textAlign: 'center',
  },
  fundsOnboardingDim: { opacity: 0.32 },
  destinationRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  destinationRowTradeOnly: { gap: 0 },
  destinationCardWrap: { flex: 1, minWidth: 0, position: 'relative' },
  destinationPulseRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: colors.accent.gold,
    zIndex: 2,
  },
  destinationCard: { flex: 1, minWidth: 0 },
  /** Banking off: full-width Trade card, content centered under the single rail. */
  destinationCardTradeOnly: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  destinationCardLocked: { opacity: 0.55 },
  cardLabelRowTradeOnly: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: '100%',
  },
  balanceCardLabelOnGradient: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  /** Must override `flex: 1` from OnGradient — that shorthand leaves flexBasis 0,
   *  so the title collapsed to 0 width in the shrink-wrapped Trade row. */
  balanceCardLabelTradeOnly: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    textAlign: 'center',
    fontSize: 15,
  },
  amountRowTradeOnly: {
    justifyContent: 'center',
    width: '100%',
  },
  balanceValueRowTradeOnly: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    alignItems: 'center',
  },
  bankBalanceDotsTradeOnly: {
    alignItems: 'center',
  },
  tradeSubTradeOnly: {
    width: '100%',
    textAlign: 'center',
  },
  moveOutlineBtnTradeOnly: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 280,
  },
  balanceBigOnGradient: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  localBalanceText: {
    marginTop: 1,
    alignSelf: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.tertiary,
    lineHeight: 13,
  },
  localBalanceDots: {
    alignSelf: 'center',
    height: 13,
    marginTop: 1,
    justifyContent: 'center',
  },
  bankBalanceDots: {
    height: 20,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  balanceBigUnitOnGradient: { fontSize: 13, fontWeight: '800', color: colors.text.secondary },
  tradeSubOnGradient: { marginTop: 6, fontSize: 11, color: colors.text.tertiary, minHeight: 14 },
  moveOutlineBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.accent.gold,
    backgroundColor: '#F0FDF4',
  },
  moveOutlineBtnText: { fontSize: 13, fontWeight: '800', color: colors.accent.goldDark },
  balancesRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  balanceCard: {
    flex: 1,
    backgroundColor: colors.background.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  balanceCardLeft: {},
  balanceCardRight: {},
  balanceBig: { marginTop: 2, fontSize: 18, fontWeight: '900', color: colors.text.primary, fontVariant: ['tabular-nums'] },
  balanceBigUnit: { fontSize: 14, fontWeight: '800', color: colors.text.secondary },
  incomingPill: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#ECFDF3',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#86EFAC',
    maxWidth: '100%',
  },
  incomingPillCentered: {
    alignSelf: 'center',
  },
  incomingPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent.goldDark,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  amountRowInline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  balanceValueRow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    minHeight: 26,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  tweenedBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  tweenedBalanceShrink: { flexShrink: 1, minWidth: 0 },
  usdcIcon: { width: 20, height: 20, borderRadius: 999 },
  tradeSub: { marginTop: 6, fontSize: 12, color: colors.text.tertiary, minHeight: 16 },
  transferCta: {
    backgroundColor: colors.accent.gold,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  // Demo-mode muted variant: same dimensions, neutral background, dim text.
  // No copy change, just clearly non-interactive.
  transferCtaDisabled: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  transferCtaSideMuted: {
    color: colors.text.tertiary,
  },
  transferCtaMidTextMuted: {
    color: colors.text.tertiary,
    opacity: 1,
  },
  transferCtaTopText: { fontSize: 12, fontWeight: '900', color: colors.background.primary, opacity: 0.9 },
  transferCtaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  transferCtaSide: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.background.primary,
    lineHeight: 15,
    textAlign: 'center',
  },
  transferCtaSideShrink: {
    flex: 1,
    minWidth: 0,
  },
  transferCtaMid: {
    width: 54,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferCtaMidText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    color: colors.background.primary,
    opacity: 0.75,
    textAlign: 'center',
  },
  addrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.primary,
  },
  addrText: { fontSize: 12, color: colors.text.tertiary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  walletBalancesRow: { marginTop: 10, flexDirection: 'row', gap: 12 },
  walletBalanceItem: { flex: 1, backgroundColor: colors.background.primary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border.primary },
  walletBalanceLabel: { fontSize: 12, color: colors.text.secondary },
  walletBalanceValue: { marginTop: 6, fontSize: 18, fontWeight: '800', color: colors.text.primary },
  secondaryButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 16,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontWeight: '900', color: colors.text.primary },
  modalCloseBtn: { padding: 6 },
  modalSubtitle: { marginTop: 10, fontSize: 13, color: colors.text.secondary, lineHeight: 18 },
  modalText: { marginTop: 10, fontSize: 13, color: colors.text.secondary, lineHeight: 18 },
  depositArbitrumNetworkAccent: {
    color: colors.accent.gold,
    fontWeight: '700',
  },
  depositAddressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: `${colors.accent.gold}15`,
  },
  depositArbIconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  depositArbIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  depositAddressFull: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
    color: colors.accent.gold,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  depositWalletIconBtn: { padding: 2, flexShrink: 0 },
  modalButtons: { marginTop: 16, flexDirection: 'row', gap: 10 },
  modalSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.primary,
    alignItems: 'center',
  },
  modalSecondaryText: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  modalPrimaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accent.gold,
    alignItems: 'center',
  },
  modalPrimaryText: { fontSize: 13, fontWeight: '900', color: colors.background.primary },

  // Deposit options styles
  depositOptionSection: {},
  payTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  payIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  depositOptionTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary, marginBottom: 0 },
  depositOptionDesc: { fontSize: 12, color: colors.text.secondary, lineHeight: 18, marginBottom: 12 },
  buyCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent.gold,
  },
  buyCardBtnText: { fontSize: 14, fontWeight: '800', color: colors.background.primary },
  depositDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  depositDividerLine: { flex: 1, height: 1, backgroundColor: colors.border.primary },
  depositDividerText: { paddingHorizontal: 12, fontSize: 12, color: colors.text.tertiary, fontWeight: '600' },
  addUsdcModalCard: { maxHeight: '92%' },
  /** Tall enough for bank CTA + QR + address pill without scrolling on typical phones. */
  addUsdcModalScroll: { maxHeight: 600 },
  addUsdcModalScrollContent: { paddingBottom: 16, flexGrow: 0 },
  depositModalBankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    minHeight: 44,
  },
  depositModalBankBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.background.primary,
    flexShrink: 1,
  },
  addUsdcQrWrap: {
    alignSelf: 'center',
    marginBottom: 12,
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  addUsdcQrCode: { width: 140, height: 140 },

  // ─── Smart Account recovery banner ──────────────────────────────────
  recoveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${colors.status.warning}15`,
    borderWidth: 1,
    borderColor: `${colors.status.warning}40`,
    borderRadius: 14,
    padding: 14,
  },
  recoveryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.status.warning,
    marginBottom: 4,
  },
  recoveryDesc: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  recoveryBtn: {
    backgroundColor: colors.accent.gold,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    minWidth: 72,
    maxWidth: '42%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.background.primary,
    textAlign: 'center',
  },
  confettiOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
});