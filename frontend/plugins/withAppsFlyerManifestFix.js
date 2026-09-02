const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAppsFlyerManifestFix(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = manifest.application?.[0];
    if (application) {
      const existing = application.$['tools:replace'] || '';
      const attrs = existing.split(',').filter(Boolean);

      for (const attr of ['android:fullBackupContent', 'android:dataExtractionRules']) {
        if (!attrs.includes(attr)) attrs.push(attr);
      }

      application.$['tools:replace'] = attrs.join(',');
    }

    return config;
  });
};
