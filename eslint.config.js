import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
export default [
  { ignores: ["node_modules/**", "dist/**", "supabase/functions/**"] },
  { files: ["**/*.ts", "**/*.tsx"], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "@typescript-eslint": tseslint.plugin, "react-hooks": hooks },
    rules: { "no-debugger": "error", "no-constant-condition": "error" },
    linterOptions: { reportUnusedDisableDirectives: "off" } },
  { files: ["server/**/*.ts", "src/concierge/**/*.ts", "tests/**/*.ts", "api/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "error" } },
];
