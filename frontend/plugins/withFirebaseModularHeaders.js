const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to add use_modular_headers! to the Podfile
 * This fixes the Firebase/GoogleUtilities Swift module import issue
 */
const withFirebaseModularHeaders = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');
        
        // Check if use_modular_headers! is already present
        if (!podfileContent.includes('use_modular_headers!')) {
          // Add use_modular_headers! after the platform line
          podfileContent = podfileContent.replace(
            /(platform :ios.*\n)/,
            `$1use_modular_headers!\n`
          );
          
          fs.writeFileSync(podfilePath, podfileContent);
        }
      }
      
      return config;
    },
  ]);
};

module.exports = withFirebaseModularHeaders;
