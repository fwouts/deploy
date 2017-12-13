const path = require("path");

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
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist")
  }
};
