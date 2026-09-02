// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// Keep package.json "exports" enabled (needed for subpath exports like `@privy-io/expo/ui`)
// Use "browser" condition so `jose` resolves to its browser build (RN-safe).
// Avoid "import" condition — it causes @babel/runtime helpers to resolve to ESM files
// that break CJS require() calls (e.g. _objectWithoutPropertiesLoose is not a function).
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  'react-native',
  'browser',
  'require',
  'default',
];

// Work around a Metro + `uuid` resolution edge-case (pulled in by Privy SDK):
// Metro can pick `uuid/wrapper.mjs` which assumes Node-style CJS default interop.
// Force `uuid` to resolve to the browser ESM build instead.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  uuid: path.join(__dirname, 'node_modules', 'uuid', 'dist', 'esm-browser', 'index.js'),
  jose: path.join(__dirname, 'node_modules', 'jose', 'dist', 'browser', 'index.js'),
};

// Reown AppKit does `import * as BigNumber from 'bignumber.js'`. The module has
// an own `default` export key, so Metro's strict-mode `_interopNamespace` builds
// a getter-only `default` then throws reassigning it. Redirect to a shim that
// tags the module `__esModule`, making the interop return early. See
// src/shims/bignumberShim.js.
const bignumberShim = path.join(__dirname, 'src', 'shims', 'bignumberShim.js');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'bignumber.js') {
    return { filePath: bignumberShim, type: 'sourceFile' };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Use a stable on-disk store (shared across web/android)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];


// // Exclude unnecessary directories from file watching
// config.watchFolders = [__dirname];
// config.resolver.blacklistRE = /(.*)\/(__tests__|android|ios|build|dist|.git|node_modules\/.*\/android|node_modules\/.*\/ios|node_modules\/.*\/windows|node_modules\/.*\/macos)(\/.*)?$/;

// // Alternative: use a more aggressive exclusion pattern
// config.resolver.blacklistRE = /node_modules\/.*\/(android|ios|windows|macos|__tests__|\.git|.*\.android\.js|.*\.ios\.js)$/;

// Reduce the number of workers to decrease resource usage
config.maxWorkers = 2;

module.exports = config;
