import nest from "@warehouser/eslint-config/nest";

export default [
  ...nest,
  {
    ignores: ["dist/**", "node_modules/**"]
  }
];
