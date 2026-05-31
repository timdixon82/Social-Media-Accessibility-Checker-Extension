const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  devtool: false,
  entry: {
    'background/service_worker': './src/background/service_worker.js',
    'offscreen/offscreen':       './src/offscreen/offscreen.js',
    'popup/popup':               './src/popup/popup.js',
    'app/app':                   './src/app/app.js',
    'sandbox/sandbox':           './src/sandbox/sandbox.js',
    'content/content_script':    './src/content/content_script.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'), // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal — __dirname is a Node.js build-time constant, not user-supplied input; no traversal risk here.
    filename: '[name].js',
    publicPath: '/',
    clean: true,
  },
  optimization: {
    splitChunks: false,
  },
  experiments: {
    asyncWebAssembly: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json',                  to: '.' },
        { from: 'src/offscreen/offscreen.html',   to: 'offscreen/' },
        { from: 'src/popup/popup.html',           to: 'popup/' },
        { from: 'src/app/app.html',               to: 'app/' },
        { from: 'src/sandbox/sandbox.html',       to: 'sandbox/' },
        { from: 'src/icons/',                     to: 'icons/' },
        {
          from: 'node_modules/@gutenye/ocr-models/assets/',
          to: 'vendor/models/',
          noErrorOnMissing: true,
        },
        {
          from: 'node_modules/onnxruntime-web/dist/',
          to: 'vendor/ort/',
          filter: (p) => /\.(wasm|mjs)$/.test(p) || /ort-[^/]+\.js$/.test(p),
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
  resolve: {
    extensions: ['.js'],
    // opencv-js (pulled in by @gutenye/ocr-browser) references Node built-ins
    // that don't exist in the browser. Stub them out so webpack doesn't error.
    fallback: {
      fs:     false,
      crypto: false,
      path:   false,
      canvas: false,
    },
  },
};
