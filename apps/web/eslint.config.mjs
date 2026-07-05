import uiConfig from "@warehouser/eslint-config-ui";

export default [
  ...uiConfig,
  {
    ignores: ["dist/**", "node_modules/**"]
  }
];
