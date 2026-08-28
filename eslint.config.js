import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import prettierConfig from "eslint-config-prettier";

// 이 레포는 여러 개의 Manifest V3 확장(chrome-extension/, 보류 중인 spotify/)을 담고
// 있고 빌드 도구가 없다(CLAUDE.md 참고). 그래서 taget/브라우저 구분 없이 chrome.* +
// 표준 웹/서비스워커 전역만 허용하는 단일 설정으로 충분하다.
const extensionGlobals = {
  ...globals.browser,
  ...globals.serviceworker,
  chrome: "readonly",
};

export default defineConfig([
  {
    ignores: ["node_modules/**"],
  },
  js.configs.recommended,
  {
    // import/export를 쓰는 파일: background/service-worker.js(manifest에 type:"module"),
    // popup.js(<script type="module">), spotify/의 모든 background 파일.
    files: [
      "chrome-extension/background/**/*.js",
      "chrome-extension/popup/**/*.js",
      "spotify/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: extensionGlobals,
    },
  },
  {
    // chrome.scripting.executeScript로 파일 그대로 주입되는 콘텐츠 스크립트.
    // import/export를 쓰지 않는 고전 스크립트(IIFE)다.
    files: ["chrome-extension/content/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: extensionGlobals,
    },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
      curly: "error",
    },
  },
  // 스타일 규칙은 Prettier가 담당하므로 ESLint 쪽 스타일 규칙을 끈다. 반드시 마지막.
  prettierConfig,
]);
