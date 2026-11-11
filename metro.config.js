const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // تجاهل فولدرات بناء native جوه node_modules عشان مراقب ملفات metro
    // ما يحاولش يراقب مسارات build مش موجودة - كان بيعمل crash للسيرفر
    // (ENOENT watch على react-native-webrtc/android/build).
    blockList: /node_modules\/.*\/(android|ios)\/(build|\.cxx)\/.*/,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
