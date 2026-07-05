import base from "./base.js";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...base,
  reactPlugin.configs.flat.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off"
    },
    settings: {
      react: { version: "detect" }
    }
  }
];
