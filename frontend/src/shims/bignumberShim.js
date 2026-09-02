// Load the real CJS file by subpath so metro.config.js does not alias
// `bignumber.js` back to this shim (infinite resolve loop).
const BigNumber = require('bignumber.js/bignumber.js');

// Reown AppKit does `import * as BigNumber from 'bignumber.js'`. Upstream
// already has a `default` key, so Metro's strict `_interopNamespace` throws
// when it tries to assign `namespace.default`. Tagging `__esModule` makes
// that helper return the module as-is.
if (BigNumber && (typeof BigNumber === 'function' || typeof BigNumber === 'object')) {
  BigNumber.__esModule = true;
  if (BigNumber.default == null) {
    BigNumber.default = BigNumber;
  }
}

module.exports = BigNumber;
