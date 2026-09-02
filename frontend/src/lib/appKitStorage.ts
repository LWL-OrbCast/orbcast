import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Storage } from '@reown/appkit-react-native';

/** AsyncStorage-backed persistence for Reown AppKit sessions (WalletConnect). */
export const appKitStorage: Storage = {
  async getKeys() {
    return [...(await AsyncStorage.getAllKeys())];
  },
  async getEntries<T = unknown>() {
    const keys = await AsyncStorage.getAllKeys();
    const pairs = await AsyncStorage.multiGet(keys);
    return pairs.map(([key, value]) => {
      try {
        return [key, JSON.parse(value ?? 'null') as T] as [string, T];
      } catch {
        return [key, value as T] as [string, T];
      }
    });
  },
  async getItem<T = unknown>(key: string) {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  },
  async setItem<T = unknown>(key: string, value: T) {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
  },
};
