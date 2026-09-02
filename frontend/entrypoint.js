// Polyfills - MUST be imported before anything else
import 'fast-text-encoding';
import '@walletconnect/react-native-compat';
import 'react-native-get-random-values';
import '@ethersproject/shims';

// Buffer polyfill
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Hyperliquid / DOM Event polyfills (React Native doesn't provide Event/CustomEvent)
// Fixes: [ReferenceError: Property 'Event' doesn't exist]
if (typeof global.Event === 'undefined') {
  global.Event = class EventPolyfill {
    constructor(type, eventInitDict) {
      this.type = type;
      this.bubbles = !!eventInitDict?.bubbles;
      this.cancelable = !!eventInitDict?.cancelable;
      this.composed = !!eventInitDict?.composed;
    }
  };
}
if (typeof global.CustomEvent === 'undefined') {
  global.CustomEvent = class CustomEventPolyfill extends global.Event {
    constructor(type, eventInitDict) {
      super(type, eventInitDict);
      this.detail = eventInitDict?.detail ?? null;
    }
  };
}

// Hyperliquid uses EventTarget in its websocket transport, but RN doesn't ship it.
// Fixes: [ReferenceError: Property 'EventTarget' doesn't exist]
if (typeof global.EventTarget === 'undefined') {
  global.EventTarget = class EventTargetPolyfill {
    constructor() {
      this.__listeners = new Map();
    }
    addEventListener(type, callback) {
      if (!callback) return;
      const list = this.__listeners.get(type) ?? new Set();
      list.add(callback);
      this.__listeners.set(type, list);
    }
    removeEventListener(type, callback) {
      const list = this.__listeners.get(type);
      if (!list || !callback) return;
      list.delete(callback);
    }
    dispatchEvent(event) {
      const type = event?.type;
      if (!type) return false;
      const list = this.__listeners.get(type);
      if (!list) return false;
      for (const cb of list) {
        try {
          cb.call(this, event);
        } catch {}
      }
      return true;
    }
  };
}

// Fix for isKeyObject undefined error
if (typeof global.crypto === 'undefined') {
  global.crypto = {};
}
if (typeof global.crypto.getRandomValues === 'undefined') {
  // Already provided by react-native-get-random-values
}

// Then import the expo router
import 'expo-router/entry';
