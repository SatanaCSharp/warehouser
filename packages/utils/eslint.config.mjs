import base from "@warehouser/eslint-config/base";

export default [
  ...base,
  {
    ignores: ["dist/**", "node_modules/**"]
  }
];
