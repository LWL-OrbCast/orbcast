/**
 * EAS file env vars are paths on the builder, not the file contents.
 * @see https://docs.expo.dev/eas/environment-variables/faq/
 */
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_PLIST || './GoogleService-Info.plist',
  },
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON || './google-services.json',
  },
});
