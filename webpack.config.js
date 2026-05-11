import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';

/** Warn if an entry’s initial assets or any single file exceed this (browser extension, minified). */
const MAX_BUNDLE_BYTES = 1024 * 1024;

export default {
  mode: 'production',
  entry: {
    content: './src/content/index.ts',
    background: './src/background/index.ts',
    popup: './src/ui/modules/popup/index.tsx',
    settings: './src/ui/modules/settings/index.tsx',
  },
  output: {
    path: path.resolve('dist'),
    filename: '[name].js',
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './src/settings.html',
      filename: 'settings.html',
      chunks: ['settings'],
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve('manifest.json'), to: path.resolve('dist') },
        { from: path.resolve('public'), to: path.resolve('dist/public') },
        { from: path.resolve('_locales'), to: path.resolve('dist/_locales') },
      ],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              ['@babel/preset-react', { runtime: 'automatic' }],
              '@babel/preset-typescript',
            ],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: {
      '@': path.resolve('src'),
    },
  },
  performance: {
    hints: 'warning',
    maxEntrypointSize: MAX_BUNDLE_BYTES,
    maxAssetSize: MAX_BUNDLE_BYTES,
  },
};
