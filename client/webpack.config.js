const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const sveltePreprocess = require('svelte-preprocess');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = env => {
	const config = {
		production: env.production == "true" ? true : false,
		watch: env.watch == "true" ? true : false,
	};
	console.log('Webpack configuration:\n' + JSON.stringify(config, null, 2));
	return {
		optimization: {
			minimize: config.production,
			minimizer: [new TerserPlugin({
				terserOptions: {
				ecma: undefined,
				parse: {},
				compress: {},
				mangle: true, // Note `mangle.properties` is `false` by default.
				module: false,
				// Deprecated
				output: null,
				format: null,
				toplevel: false,
				nameCache: null,
				ie8: false,
				keep_classnames: undefined,
				keep_fnames: false,
				safari10: false,
			}})],
		},
		watch: config.watch,
		watchOptions: {},
		mode: config.production ? 'production' : 'development',
		entry: {
			home: './src/index.tsx'
		},
		devtool: config.production ? undefined : 'source-map',
		output: {
			path: path.resolve(__dirname, './public/build'),
			filename: 'index.js'
		},
		module: {
			rules: [
				{
					test: /\.svelte$/,
					use: {
						loader: 'svelte-loader',
						options: {
							emitCss: true,
              hotReload: true,
							preprocess: sveltePreprocess({ sourceMap: !config.production })
						}
					}
				},
				{ test: /\.txt$/, use: 'raw-loader' },
				{ test: /\.tsx?$/, loader: "ts-loader" },
				{ enforce: "pre", test: /\.js$/, loader: "source-map-loader" },
				{ test: /\.css$/, use: ['style-loader', 'css-loader'] },
				{ test: /\.exec\/calc.js/, use: ['script-loader'] },
				{ test: /\.vert$/, loader: 'webpack-glsl-loader' },
				{ test: /\.frag$/, loader: 'webpack-glsl-loader' },
				{ test: /\.json$/, type: 'json' }, // Import JSON directly
			]
		},
		resolve: {
			modules: [
				path.resolve(__dirname + '/src'),
				path.resolve(__dirname + '/node_modules')
			],
			extensions: ['.ts', '.tsx', ".js", ".jsx", ".svelte"],
			mainFields: ['svelte', 'browser', 'module', 'main']
		},
		plugins: [
			new webpack.DefinePlugin({
				"process.env.NODE_ENV": JSON.stringify(config.production ? 'production' : 'development'),
				"process.env.server": env.server ? true : false
			}),
			new CopyPlugin({
				patterns: [
					{
						from: path.resolve(__dirname, 'src/mouse/assets/atlas.png'),
						to: path.resolve(__dirname, 'public/img/atlas.png')
					}
				]
			})
		]
	};
};