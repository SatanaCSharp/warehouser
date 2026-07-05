import base from "./base.js";

export default [
  ...base,
  {
    rules: {
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error"
    }
  }
];
