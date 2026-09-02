/**
 * Firebase Analytics wrapper for OrbCast
 *
 * Usage:
 *   import { Analytics } from '../lib/analytics';
 *
 *   Analytics.logScreenView('Portfolio');
 *   Analytics.logDeposit(50);
 */

import analytics from '@react-native-firebase/analytics';

export const Analytics = {
  /**
   * Log when user views a screen
   */
  async logScreenView(screenName: string, screenClass?: string) {
    try {
      await analytics().logScreenView({
        screen_name: screenName,
        screen_class: screenClass || screenName,
      });
    } catch (e) {
      // Silently fail - analytics should never break the app
      console.debug('[Analytics] logScreenView error:', e);
    }
  },

  /**
   * Log user login
   */
  async logLogin(method: 'email' | 'google' | 'apple' | 'passkey' | 'telegram' | 'twitter') {
    try {
      await analytics().logLogin({ method });
    } catch (e) {
      console.debug('[Analytics] logLogin error:', e);
    }
  },

  /**
   * Log user signup
   */
  async logSignUp(method: 'email' | 'google' | 'apple' | 'passkey' | 'telegram' | 'twitter') {
    try {
      await analytics().logSignUp({ method });
    } catch (e) {
      console.debug('[Analytics] logSignUp error:', e);
    }
  },

  /**
   * Log deposit to trading account
   */
  async logDeposit(amountUsd: number) {
    try {
      await analytics().logEvent('deposit', {
        value: amountUsd,
        currency: 'USD',
      });
    } catch (e) {
      console.debug('[Analytics] logDeposit error:', e);
    }
  },

  /**
   * Log withdrawal from trading account
   */
  async logWithdrawal(amountUsd: number) {
    try {
      await analytics().logEvent('withdrawal', {
        value: amountUsd,
        currency: 'USD',
      });
    } catch (e) {
      console.debug('[Analytics] logWithdrawal error:', e);
    }
  },

  /**
   * Log custom event
   */
  async logEvent(eventName: string, params?: Record<string, any>) {
    try {
      await analytics().logEvent(eventName, params);
    } catch (e) {
      console.debug('[Analytics] logEvent error:', e);
    }
  },

  /**
   * Set user ID for cross-device tracking (use wallet address or privy user ID)
   */
  async setUserId(userId: string | null) {
    try {
      await analytics().setUserId(userId);
    } catch (e) {
      console.debug('[Analytics] setUserId error:', e);
    }
  },

  /**
   * Set user properties
   */
  async setUserProperties(properties: Record<string, string | null>) {
    try {
      for (const [key, value] of Object.entries(properties)) {
        await analytics().setUserProperty(key, value);
      }
    } catch (e) {
      console.debug('[Analytics] setUserProperties error:', e);
    }
  },
};
