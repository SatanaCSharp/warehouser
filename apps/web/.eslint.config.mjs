import react from "@warehouser/eslint-config/react";

export default [
  ...react,
  {
    ignores: ["dist/**", "node_modules/**"]
  }
];
