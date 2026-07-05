import serviceConfig from "@warehouser/eslint-config-service";

export default [
  ...serviceConfig,
  {
    ignores: ["dist/**", "node_modules/**"]
  }
];
