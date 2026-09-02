import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Linking,
  InteractionManager,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors } from '../src/theme/colors';
import { useAuth } from '../src/providers/AuthContext';
import { isOAuthCancelledError } from '../src/lib/oauthRecovery';
import { forceCloseWalletConnectModal } from '../src/lib/externalWalletConnect';
import { SocialLoginMoreSheet, type SocialLoginMoreOption } from '../src/components/SocialLoginMoreSheet';
import { useTranslation } from 'react-i18next';
import type { OAuthProviderName } from '../src/providers/AuthContext';

const PRIVY_URL = 'https://www.privy.io/';
const OTP_LENGTH = 6;

type SocialProvider = Extract<OAuthProviderName, 'google' | 'apple' | 'twitter'>;

/**
 * Extra logins under “More options” (X, and optionally WalletConnect).
 * Off until this app has X OAuth credentials — set to true to show the row.
 */
const SHOW_MORE_LOGIN_OPTIONS = false;

const MORE_SOCIAL_OPTIONS: SocialLoginMoreOption[] = [
  {
    id: 'twitter',
    imageSource: require('../assets/images/x-logo-black.webp'),
    labelKey: 'login.continueTwitter',
    accessibilityKey: 'login.continueTwitter',
  },
  // External EOA / WalletConnect login. Hidden for this product — uncomment
  // if a builder wants MetaMask / WC SIWE next to X. Handler: handleMoreSocialSelect.
  // {
  //   id: 'wallet',
  //   icon: 'wallet-outline',
  //   labelKey: 'login.continueWallet',
  //   accessibilityKey: 'login.continueWallet',
  //   hintKey: 'login.walletManualApprovalHint',
  // },
];

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { 
    sendEmailCode, 
    verifyEmailCode, 
    clearPendingEmailVerification,
    loginWithGoogle,
    loginWithApple,
    loginWithTwitter,
    loginWithWallet,
    isLoading,
    pendingEmail,
    isAuthenticated,
    isReady,
    isPendingOAuth,
    pendingOAuthProvider,
    needsOAuthRetry,
    clearOAuthRetryHint,
    retryPendingOAuth,
    isUrTestWalletImportEnabled,
    urTestWalletAddress,
    importUrTestWallet,
    isPendingWalletLogin,
  } = useAuth();
  
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [isUrImportLoading, setIsUrImportLoading] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [otpCursorVisible, setOtpCursorVisible] = useState(true);
  const codeInputRef = useRef<TextInput>(null);
  const otpFocusTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasAutoVerifiedRef = useRef(false);
  const enteredCodeStepRef = useRef(false);
  const oauthFromMoreRef = useRef(false);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Resend rate limiting
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCodeStep = !!pendingEmail;
  const activeOtpIndex = code.length < OTP_LENGTH ? code.length : -1;
  const isGoogleLoading = isPendingOAuth && pendingOAuthProvider === 'google';
  const isAppleLoading = isPendingOAuth && pendingOAuthProvider === 'apple';
  const isTwitterLoading = isPendingOAuth && pendingOAuthProvider === 'twitter';
  const walletLoginBusy = isPendingWalletLogin || isWalletLoading;
  const isOtpInputDisabled = isLoading || isEmailLoading || isPendingOAuth || walletLoginBusy;
  const isSocialDisabled = isEmailLoading || isPendingOAuth || walletLoginBusy;
  const moreSocialLoadingId = walletLoginBusy
    ? 'wallet'
    : isTwitterLoading
      ? 'twitter'
      : null;
  const isMoreOptionsLoading = walletLoginBusy || isTwitterLoading;

  const clearOtpFocusTimers = useCallback(() => {
    otpFocusTimersRef.current.forEach(clearTimeout);
    otpFocusTimersRef.current = [];
  }, []);

  const scheduleOtpFocus = useCallback((delaysMs: number[]) => {
    clearOtpFocusTimers();
    const focus = () => codeInputRef.current?.focus();
    delaysMs.forEach((delay) => {
      otpFocusTimersRef.current.push(setTimeout(focus, delay));
    });
  }, [clearOtpFocusTimers]);

  const focusOtpInput = useCallback(() => {
    const delays = Platform.OS === 'android'
      ? [0, 80, 250, 450, 700, 1000]
      : [0, 80, 250];
    scheduleOtpFocus(delays);
  }, [scheduleOtpFocus]);

  useEffect(() => {
    if (!isCodeStep || code.length >= OTP_LENGTH) return;
    const id = setInterval(() => setOtpCursorVisible((v) => !v), 530);
    return () => clearInterval(id);
  }, [isCodeStep, code.length]);

  // Email step unmount dismisses the keyboard; OTP must use a non-zero-opacity capture
  // input and refocus after layout (opacity:0 inputs often won't open IME on Android).
  useEffect(() => {
    if (!isCodeStep) {
      enteredCodeStepRef.current = false;
      return;
    }
    if (isOtpInputDisabled) return;

    if (!enteredCodeStepRef.current) {
      enteredCodeStepRef.current = true;
      Keyboard.dismiss();
    }

    const task = InteractionManager.runAfterInteractions(() => {
      focusOtpInput();
    });
    return () => {
      task.cancel();
      clearOtpFocusTimers();
    };
  }, [isCodeStep, isOtpInputDisabled, focusOtpInput, clearOtpFocusTimers]);

  useFocusEffect(
    useCallback(() => {
      if (!isCodeStep || isOtpInputDisabled) return;
      const task = InteractionManager.runAfterInteractions(() => {
        scheduleOtpFocus(Platform.OS === 'android' ? [150, 400] : [80, 250]);
      });
      return () => {
        task.cancel();
        clearOtpFocusTimers();
      };
    }, [isCodeStep, isOtpInputDisabled, scheduleOtpFocus, clearOtpFocusTimers]),
  );

  const handleOtpContainerLayout = useCallback(() => {
    if (!isCodeStep || isOtpInputDisabled) return;
    scheduleOtpFocus(Platform.OS === 'android' ? [0, 120, 300] : [0, 80]);
  }, [isCodeStep, isOtpInputDisabled, scheduleOtpFocus]);

  const handleOtpChangeText = useCallback((text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    if (!digits) {
      setCode('');
      return;
    }
    setCode((prev) => {
      if (digits.length > 1) {
        return digits.slice(0, OTP_LENGTH);
      }
      return `${prev}${digits}`.slice(0, OTP_LENGTH);
    });
  }, []);

  const handleOtpKeyPress = useCallback(({ nativeEvent }: { nativeEvent: { key: string } }) => {
    if (nativeEvent.key === 'Backspace') {
      setCode((prev) => prev.slice(0, -1));
    }
  }, []);

  useEffect(() => {
    if (isReady && isAuthenticated) {
      forceCloseWalletConnectModal();
      // Login is a stack modal. `replace('/')` can leave that presentation
      // layer on top of Home (looks like Home, eats every tap). Dismiss it.
      if (router.canDismiss()) {
        router.dismissAll();
      } else {
        router.replace('/');
      }
    }
  }, [isAuthenticated, isReady, router]);

  const handleClose = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const startResendCooldown = useCallback(() => {
    setResendCooldown(60); // 60 seconds
    if (resendIntervalRef.current) {
      clearInterval(resendIntervalRef.current);
    }
    resendIntervalRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current) {
            clearInterval(resendIntervalRef.current);
            resendIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup intervals and timeouts on unmount
  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) {
        clearInterval(resendIntervalRef.current);
      }
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  const handleSendCode = async () => {
    // Clear any pending error timeout
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    
    const targetEmail = (pendingEmail || email).trim().toLowerCase();
    if (!targetEmail) {
      setError(t('login.pleaseEnterEmail'));
      return;
    }
    if (!targetEmail.includes('@')) {
      setError(t('login.pleaseValidEmail'));
      return;
    }
    
    setError('');
    setIsEmailLoading(true);
    try {
      await sendEmailCode(targetEmail);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Start cooldown for resend
      startResendCooldown();
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleChangeEmail = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (resendIntervalRef.current) {
      clearInterval(resendIntervalRef.current);
      resendIntervalRef.current = null;
    }
    if (pendingEmail) {
      setEmail(pendingEmail);
    }
    setCode('');
    setError('');
    setResendCooldown(0);
    hasAutoVerifiedRef.current = false;
    clearPendingEmailVerification();
  }, [clearPendingEmailVerification, pendingEmail]);

  const handleVerifyCode = useCallback(async () => {
    if (!code.trim() || code.length < 6) {
      setError(t('login.pleaseEnterCode'));
      return;
    }
    
    setError('');
    try {
      await verifyEmailCode(code.trim());
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid code');
      focusOtpInput();
      // Don't reset hasAutoVerifiedRef here - it causes a loop!
      // The flag is reset in the useEffect when code.length < 6 (user edits)
    }
  }, [code, verifyEmailCode, router, focusOtpInput]);

  // Auto-verify when 6 digits are entered
  useEffect(() => {
    if (isCodeStep && code.length === 6 && !isLoading && !hasAutoVerifiedRef.current) {
      hasAutoVerifiedRef.current = true;
      handleVerifyCode();
    }
  }, [code, isCodeStep, isLoading, handleVerifyCode]);

  // Reset auto-verify flag when code changes (user editing)
  // Only clear error when in code step (not email step)
  useEffect(() => {
    if (code.length < 6) {
      hasAutoVerifiedRef.current = false;
      // Clear error when user starts editing the code (only in code step)
      if (isCodeStep && error) {
        setError('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isCodeStep]);

  const handleWalletLogin = async () => {
    setError('');
    setIsWalletLoading(true);
    try {
      await loginWithWallet();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.somethingWentWrong', { defaultValue: 'Something went wrong' });
      const isBenignWalletNoise =
        message.includes('Request expired')
        || message.includes('Wallet connect cancelled')
        || message.includes('Wallet connect superseded');
      if (!isBenignWalletNoise) {
        setError(message);
      }
    } finally {
      setIsWalletLoading(false);
    }
  };

  const handleSocialLogin = async (provider: SocialProvider) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setError('');
    clearOAuthRetryHint();
    try {
      if (provider === 'google') await loginWithGoogle();
      else if (provider === 'apple') await loginWithApple();
      else await loginWithTwitter();
    } catch (err: unknown) {
      if (!isOAuthCancelledError(err)) {
        setError((err as Error)?.message || 'Sign-in failed');
      }
    }
  };

  const handleMoreSocialSelect = (providerId: string) => {
    oauthFromMoreRef.current = true;
    if (providerId === 'wallet') {
      // Dismiss our sheet first — RN Modal blocks AppKit's modal underneath.
      // Mark loading immediately so More options shows a spinner after the sheet closes
      // (including while the user is away in their wallet app and on return).
      setMoreOptionsOpen(false);
      setIsWalletLoading(true);
      setTimeout(() => {
        void handleWalletLogin();
      }, 300);
      return;
    }
    void handleSocialLogin(providerId as SocialProvider);
  };

  useEffect(() => {
    if (oauthFromMoreRef.current && !isPendingOAuth && !walletLoginBusy) {
      oauthFromMoreRef.current = false;
      setMoreOptionsOpen(false);
    }
  }, [isPendingOAuth, walletLoginBusy]);

  const handleOAuthRetry = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setError('');
    try {
      await retryPendingOAuth();
    } catch (err: unknown) {
      if (!isOAuthCancelledError(err)) {
        setError((err as Error)?.message || 'Sign-in failed');
      }
    }
  };

  const handlePrivyPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    void Linking.openURL(PRIVY_URL).catch(() => {});
  };

  const handleUrTestWalletImport = async () => {
    if (!importUrTestWallet) return;
    setError('');
    setIsUrImportLoading(true);
    try {
      await importUrTestWallet();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to attach UR test wallet');
    } finally {
      setIsUrImportLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Image
                source={require('../assets/images/orbcast-logo-circle.png')}
                style={styles.logoImage}
              />
            </View>
            <View style={styles.logoTextRow}>
              <Text style={styles.logoText}>Orb</Text>
              <MaskedView
                style={styles.logoGradientMask}
                maskElement={<Text style={styles.logoGradientText}>Cast</Text>}
              >
                <LinearGradient
                  colors={[colors.accent.gold, colors.accent.purple]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={[styles.logoGradientText, styles.logoGradientFill]}>Cast</Text>
                </LinearGradient>
              </MaskedView>
            </View>
          </View>

          <Text style={styles.title}>
            {t('login.beginJourney')}
          </Text>
          <Text style={styles.subtitle}>
            {isCodeStep 
              ? t('login.enterCode')
              : t('login.signInTitle')
            }
          </Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={colors.status.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!isCodeStep && needsOAuthRetry ? (
            <View style={styles.oauthRetryBanner}>
              <View style={styles.oauthRetryHeader}>
                <Ionicons name="information-circle" size={18} color={colors.accent.gold} />
                <Text style={styles.oauthRetryTitle}>{t('login.oauthIncompleteTitle')}</Text>
              </View>
              <Text style={styles.oauthRetryBody}>{t('login.oauthIncompleteBody')}</Text>
              <View style={styles.oauthRetryActions}>
                <TouchableOpacity
                  style={styles.oauthRetryPrimary}
                  onPress={handleOAuthRetry}
                  disabled={isPendingOAuth}
                  activeOpacity={0.85}
                >
                  {isPendingOAuth ? (
                    <ActivityIndicator color={colors.background.primary} size="small" />
                  ) : (
                    <Text style={styles.oauthRetryPrimaryText}>{t('login.oauthTryAgain')}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.oauthRetryDismiss}
                  onPress={clearOAuthRetryHint}
                  disabled={isPendingOAuth}
                  hitSlop={8}
                >
                  <Text style={styles.oauthRetryDismissText}>{t('login.oauthDismiss')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {!isCodeStep ? (
            <>
              <View style={styles.inputContainer}>
                <Ionicons name="mail" size={20} color={colors.text.tertiary} />
                <TextInput
                  style={styles.input}
                  placeholder={t('login.enterEmail')}
                  placeholderTextColor={colors.text.tertiary}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    // Clear error and any pending error timeout when user starts typing
                    if (errorTimeoutRef.current) {
                      clearTimeout(errorTimeoutRef.current);
                      errorTimeoutRef.current = null;
                    }
                    if (error) {
                      setError('');
                    }
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!isEmailLoading && !isPendingOAuth}
                  onSubmitEditing={handleSendCode}
                  returnKeyType="next"
                />
              </View>

              <TouchableOpacity 
                style={[styles.secondaryButton, isEmailLoading && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={isEmailLoading || isPendingOAuth}
                activeOpacity={0.85}
              >
                {isEmailLoading ? (
                  <ActivityIndicator color={colors.background.primary} />
                ) : (
                  <>
                    <Ionicons name="mail" size={20} color={colors.background.primary} />
                    <Text style={styles.secondaryButtonText}>{t('login.continueEmail')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('common.or')}</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={[styles.secondaryButton, isGoogleLoading && styles.buttonDisabled]}
                onPress={() => void handleSocialLogin('google')}
                disabled={isSocialDisabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('login.continueGoogle')}
              >
                {isGoogleLoading ? (
                  <ActivityIndicator color={colors.background.primary} />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={20} color={colors.background.primary} />
                    <Text style={styles.secondaryButtonText}>{t('login.continueGoogle')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, isAppleLoading && styles.buttonDisabled]}
                onPress={() => void handleSocialLogin('apple')}
                disabled={isSocialDisabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('login.continueApple')}
              >
                {isAppleLoading ? (
                  <ActivityIndicator color={colors.background.primary} />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={20} color={colors.background.primary} />
                    <Text style={styles.secondaryButtonText}>{t('login.continueApple')}</Text>
                  </>
                )}
              </TouchableOpacity>

              {SHOW_MORE_LOGIN_OPTIONS ? (
                <>
              <TouchableOpacity
                style={[styles.moreOptionsButton, (isSocialDisabled || isMoreOptionsLoading) && styles.buttonDisabled]}
                onPress={() => setMoreOptionsOpen(true)}
                disabled={isSocialDisabled || isMoreOptionsLoading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('login.moreOptions', { defaultValue: 'More options' })}
              >
                {isMoreOptionsLoading ? (
                  <ActivityIndicator color={colors.text.primary} />
                ) : (
                  <>
                    <Text style={styles.moreOptionsButtonText}>
                      {t('login.moreOptions', { defaultValue: 'More options' })}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.text.tertiary}
                      style={styles.moreOptionsChevron}
                    />
                  </>
                )}
              </TouchableOpacity>

              <SocialLoginMoreSheet
                visible={moreOptionsOpen}
                onClose={() => setMoreOptionsOpen(false)}
                options={MORE_SOCIAL_OPTIONS}
                onSelect={handleMoreSocialSelect}
                loadingId={moreSocialLoadingId}
                disabled={isSocialDisabled}
              />
                </>
              ) : null}

              <TouchableOpacity
                style={styles.privyBadge}
                onPress={handlePrivyPress}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel="Privy"
              >
                <Image
                  source={require('../assets/images/privy-protected.webp')}
                  style={styles.privyBadgeImage}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.codeContainer}>
                <View style={styles.pendingEmailRow}>
                  <Text style={styles.pendingEmailText} numberOfLines={1}>
                    {pendingEmail}
                  </Text>
                  <TouchableOpacity
                    onPress={handleChangeEmail}
                    disabled={isLoading || isEmailLoading}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.changeEmailText}>
                      {t('login.changeEmail', 'Change email')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View
                  style={styles.otpBoxContainer}
                  onLayout={handleOtpContainerLayout}
                  onStartShouldSetResponder={() => {
                    if (!isOtpInputDisabled) focusOtpInput();
                    return false;
                  }}
                  collapsable={false}
                >
                  <View style={styles.otpRow} pointerEvents="none">
                    {Array.from({ length: OTP_LENGTH }, (_, i) => (
                      <React.Fragment key={i}>
                        {i === 3 ? <View style={styles.otpGroupDivider} /> : null}
                        <View
                          style={[
                            styles.otpCell,
                            activeOtpIndex === i && styles.otpCellActive,
                          ]}
                        >
                          {code[i] ? (
                            <Text style={styles.otpDigit} allowFontScaling={false}>
                              {code[i]}
                            </Text>
                          ) : activeOtpIndex === i && otpCursorVisible ? (
                            <View style={styles.otpCursor} />
                          ) : null}
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                  <TextInput
                    ref={codeInputRef}
                    style={styles.otpCaptureInput}
                    value=""
                    onChangeText={handleOtpChangeText}
                    onKeyPress={handleOtpKeyPress}
                    keyboardType="number-pad"
                    maxLength={OTP_LENGTH + 1}
                    editable={!isOtpInputDisabled}
                    showSoftInputOnFocus
                    caretHidden
                    selectTextOnFocus={false}
                    textContentType="oneTimeCode"
                    autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                    importantForAutofill="yes"
                    underlineColorAndroid="transparent"
                  />
                </View>
              </View>

              <TouchableOpacity 
                onPress={handleVerifyCode}
                disabled={isLoading || code.length < 6}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.accent.gold, colors.accent.purple]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.primaryButton, (isLoading || code.length < 6) && styles.buttonDisabled]}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.background.primary} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{t('login.verify')}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.ghostButton, resendCooldown > 0 && styles.ghostButtonDisabled]}
                onPress={handleSendCode}
                disabled={isLoading || isEmailLoading || isPendingOAuth || resendCooldown > 0}
              >
                <Text style={[styles.ghostButtonText, resendCooldown > 0 && styles.ghostButtonTextDisabled]}>
                  {resendCooldown > 0 ? t('login.resendCodeCountdown', { seconds: resendCooldown }) : t('login.resendCode')}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {isUrTestWalletImportEnabled ? (
            <View style={styles.devImportBox}>
              <Text style={styles.devImportTitle}>UR test wallet (dev)</Text>
              <Text style={styles.devImportHint}>
                Sign in with email or social first. The whitelisted UR signer wallet attaches
                automatically{urTestWalletAddress ? ` (${urTestWalletAddress.slice(0, 6)}…${urTestWalletAddress.slice(-4)})` : ''}.
              </Text>
              {isAuthenticated && importUrTestWallet ? (
                <TouchableOpacity
                  style={[styles.devImportButton, isUrImportLoading && styles.buttonDisabled]}
                  onPress={handleUrTestWalletImport}
                  disabled={isUrImportLoading || isLoading}
                >
                  {isUrImportLoading ? (
                    <ActivityIndicator color={colors.text.primary} />
                  ) : (
                    <Text style={styles.devImportButtonText}>Retry UR wallet attach</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.terms}>
            {t('login.termsText')}{' '}
            <Text style={styles.termsLink} onPress={() => router.push('/terms')}>
              {t('login.termsOfServiceShort')}
            </Text>
            {' '}{t('login.and')}{' '}
            <Text style={styles.termsLink} onPress={() => router.push('/privacy-policy')}>
              {t('login.privacyPolicy')}
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  keyboardView: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  closeButton: { padding: 8 },
  content: { flex: 1, paddingHorizontal: 24 },
  logoContainer: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  logoIcon: { width: 72, height: 64, borderRadius: 16, backgroundColor: `${colors.accent.gold}10`, justifyContent: 'center', alignItems: 'center', marginBottom: 12, overflow: 'hidden' },
  logoImage: { width: 72, height: 64, resizeMode: 'contain' },
  logoTextRow: { flexDirection: 'row', alignItems: 'center' },
  logoText: { fontSize: 28, fontWeight: '700', color: colors.text.primary, marginRight: -4 },
  logoGradientMask: { marginLeft: 4 },
  logoGradientText: { fontSize: 28, fontWeight: '700' },
  logoGradientFill: { opacity: 0 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text.primary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.text.secondary, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  errorContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${colors.status.error}20`, padding: 12, borderRadius: 8, marginBottom: 16, gap: 8 },
  oauthRetryBanner: {
    backgroundColor: `${colors.accent.gold}12`,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}35`,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  oauthRetryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  oauthRetryTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text.primary },
  oauthRetryBody: { fontSize: 13, lineHeight: 19, color: colors.text.secondary },
  oauthRetryActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  oauthRetryPrimary: {
    backgroundColor: colors.accent.gold,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oauthRetryPrimaryText: { fontSize: 14, fontWeight: '800', color: colors.background.primary },
  oauthRetryDismiss: { paddingVertical: 8, paddingHorizontal: 4 },
  oauthRetryDismissText: { fontSize: 13, fontWeight: '600', color: colors.text.tertiary },
  errorText: { color: colors.status.error, fontSize: 14, flex: 1 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.tertiary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16, borderWidth: 1, borderColor: colors.border.primary, gap: 12 },
  input: { flex: 1, fontSize: 16, color: colors.text.primary },
  codeContainer: { marginBottom: 16 },
  pendingEmailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  pendingEmailText: { flex: 1, color: colors.text.secondary, fontSize: 13 },
  changeEmailText: { color: colors.accent.gold, fontSize: 13, fontWeight: '800' },
  otpBoxContainer: {
    position: 'relative',
    backgroundColor: colors.background.tertiary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  otpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  otpCell: {
    width: 42,
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellActive: {
    borderColor: colors.accent.gold,
  },
  otpDigit: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 28,
  },
  otpCursor: {
    width: 2,
    height: 26,
    borderRadius: 1,
    backgroundColor: colors.accent.gold,
  },
  otpGroupDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border.primary,
    marginHorizontal: 2,
  },
  otpCaptureInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 16,
    padding: 0,
    margin: 0,
    textAlign: 'left',
  },
  primaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 0,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { fontSize: 16, fontWeight: '800', color: colors.background.primary },
  divider: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border.primary },
  dividerText: { color: colors.text.tertiary, paddingHorizontal: 16, fontSize: 14 },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.gold,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 0,
    elevation: 4,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '800', color: colors.background.primary },
  moreOptionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.tertiary,
  },
  moreOptionsButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  moreOptionsChevron: {
    position: 'absolute',
    right: 16,
  },
  privyBadge: {
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 0,
  },
  privyBadgeImage: {
    width: 130,
    height: 24,
  },
  ghostButton: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: 'transparent' },
  ghostButtonText: { color: colors.text.primary, fontSize: 15, fontWeight: '700' },
  ghostButtonDisabled: { opacity: 0.5 },
  ghostButtonTextDisabled: { color: colors.text.tertiary },
  devImportBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.tertiary,
    gap: 8,
  },
  devImportTitle: { fontSize: 13, fontWeight: '800', color: colors.accent.gold },
  devImportHint: { fontSize: 12, color: colors.text.secondary, lineHeight: 18 },
  devImportButton: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  devImportButtonText: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  terms: { fontSize: 11, color: colors.text.tertiary, textAlign: 'center', marginTop: 20, marginBottom: 24, lineHeight: 18 },
  termsLink: { color: colors.accent.gold, fontWeight: '600', textDecorationLine: 'underline' },
});
