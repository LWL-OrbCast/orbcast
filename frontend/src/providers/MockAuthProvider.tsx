import React, { useState, useCallback, ReactNode } from 'react';
import { Alert } from 'react-native';
import { AuthContext, User, AuthContextType, UR_TEST_WALLET_IMPORT_ENABLED } from './AuthContext';
import { useAppStore } from '../store/appStore';

// Mock provider for web/Expo Go where Privy native isn't available
export function MockAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingLinkEmail, setPendingLinkEmail] = useState<string | null>(null);
  const setAuthenticatedStore = useAppStore((s) => s.setAuthenticated);
  const setGuest = useAppStore((s) => s.setGuest);

  const sendEmailCode = useCallback(async (email: string) => {
    setIsLoading(true);
    setPendingEmail(email);
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsLoading(false);
    Alert.alert('Demo Mode', 'In demo mode, use code "123456" to sign in.');
  }, []);

  const verifyEmailCode = useCallback(async (code: string) => {
    if (!pendingEmail) throw new Error('No pending email');
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Accept any 6 digit code in demo mode
    if (code.length === 6) {
      const id = 'demo-user-' + Date.now();
      const mockWalletAddress = '0x' + Array.from({length: 40}, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      
      const nextUser: User = {
        id,
        email: pendingEmail,
        wallet: {
          address: mockWalletAddress,
          chainType: 'ethereum',
        },
        createdAt: new Date(),
      };
      
      setUser(nextUser);
      setIsAuthenticated(true);
      setAuthenticatedStore(true, nextUser);
      setGuest(false);
      setPendingEmail(null);
    } else {
      throw new Error('Invalid code');
    }
    setIsLoading(false);
  }, [pendingEmail, setAuthenticatedStore, setGuest]);

  const clearPendingEmailVerification = useCallback(() => {
    setPendingEmail(null);
  }, []);

  const sendLinkEmailCode = useCallback(async (email: string) => {
    setIsLoading(true);
    setPendingLinkEmail(email);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    Alert.alert('Demo Mode', 'In demo mode, use code "123456" to link your email.');
  }, []);

  const verifyLinkEmailCode = useCallback(async (code: string) => {
    if (!pendingLinkEmail) throw new Error('No pending email');
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (code.length !== 6) {
      setIsLoading(false);
      throw new Error('Invalid code');
    }
    if (user) {
      setUser({ ...user, email: pendingLinkEmail });
    }
    const linked = pendingLinkEmail;
    setPendingLinkEmail(null);
    setIsLoading(false);
    return linked;
  }, [pendingLinkEmail, user]);

  const clearPendingLinkEmailVerification = useCallback(() => {
    setPendingLinkEmail(null);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    Alert.alert(
      'Development Build Required', 
      'Google login requires a native development build with Privy SDK.\n\nFor testing, please use email login with code "123456".'
    );
  }, []);

  const loginWithTelegram = useCallback(async () => {
    Alert.alert(
      'Development Build Required',
      'Telegram login requires a native development build with Privy SDK.\n\nFor testing, please use email login with code "123456".'
    );
  }, []);

  const loginWithApple = useCallback(async () => {
    Alert.alert(
      'Development Build Required',
      'Apple login requires a native development build with Privy SDK.\n\nFor testing, please use email login with code "123456".'
    );
  }, []);

  const loginWithTwitter = useCallback(async () => {
    Alert.alert(
      'Development Build Required',
      'X login requires a native development build with Privy SDK.\n\nFor testing, please use email login with code "123456".'
    );
  }, []);

  const createWallet = useCallback(async () => {
    const address = '0x' + Array.from({length: 40}, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    if (user) {
      setUser({
        ...user,
        wallet: { address, chainType: 'ethereum' }
      });
    }
    return address;
  }, [user]);

  const importUrTestWallet = useCallback(async () => {
    Alert.alert(
      'Development Build Required',
      'UR test wallet import uses the backend signer key and requires a native Privy dev build.'
    );
    throw new Error('Not available in demo mode');
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setIsAuthenticated(false);
    setPendingEmail(null);
    setPendingLinkEmail(null);
    setAuthenticatedStore(false, null);
    setGuest(true);
  }, [setAuthenticatedStore, setGuest]);

  const value: AuthContextType = {
    isReady: true,
    isAuthenticated,
    isLoading,
    isPendingOAuth: false,
    isPendingWalletLogin: false,
    pendingOAuthProvider: null,
    needsOAuthRetry: false,
    clearOAuthRetryHint: () => {},
    retryPendingOAuth: async () => {},
    user,
    walletAddress: user?.wallet?.address || null,
    smartWalletAddress: null,
    sendEmailCode,
    verifyEmailCode,
    clearPendingEmailVerification,
    sendLinkEmailCode,
    verifyLinkEmailCode,
    clearPendingLinkEmailVerification,
    pendingLinkEmail,
    isLinkingEmail: isLoading,
    loginWithGoogle,
    loginWithApple,
    loginWithTelegram,
    loginWithTwitter,
    loginWithWallet: async () => {
      Alert.alert('Demo Mode', 'Wallet login is not available in web demo mode.');
    },
    isExternalWalletUser: false,
    createWallet,
    importUrTestWallet: UR_TEST_WALLET_IMPORT_ENABLED ? importUrTestWallet : undefined,
    urTestWalletAddress: null,
    isUrTestWalletImportEnabled: UR_TEST_WALLET_IMPORT_ENABLED,
    logout,
    pendingEmail,
    getAccessToken: async () => null,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
