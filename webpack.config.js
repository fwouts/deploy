const path = require("path");

const UglifyJsPlugin = require("uglifyjs-webpack-plugin");

module.exports = {
  entry: "./src/main.ts",
  devtool: "source-map",
  target: "node",
  node: {
    __dirname: true
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/
      },
      {
        test: /\.js$/,
        use: ["remove-hashbag-loader"]
      },
      {
        test: /rx\.lite\.aggregates\.js/,
        use: "imports-loader?define=>false"
      }
    ]
  },
  resolveLoader: {
    alias: {
      "remove-hashbag-loader": path.join(
        __dirname,
        "./loaders/remove-hashbag-loader"
      )
    }
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  plugins: [
    new UglifyJsPlugin({
      sourceMap: true
    })
  ],
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "dist")
  }
};
