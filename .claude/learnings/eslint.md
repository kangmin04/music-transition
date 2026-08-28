# ESLint

## 2026-08-28 — `eslint.config.js`에 규칙을 추가하면서 나온 배경 지식

### Lint가 뭐고 왜 쓰는가
Lint는 코드를 실행하지 않고 정적으로 분석해서, 문법 오류는 아니지만 버그를 유발하거나 스타일이 어긋나는 패턴을 잡는 도구. `node --check` 같은 문법 검사보다 한 단계 더 들어가서 "문법적으론 맞지만 의미상 의심스러운 코드"(미사용 변수, 미선언 전역 참조 등)를 실행 전에 잡아준다. 특히 빌드 도구 없이 순수 JS로 여러 컨텍스트(서비스워커, 콘텐츠 스크립트 등)에 주입되는 코드에서는 전역 변수 오타 같은 게 브라우저에서 조용히 `undefined`로 실패하는 경우가 많아 lint의 효용이 큼.

### Flat config 구조 (`eslint.config.js`)
ESLint 9+ 방식. `.eslintrc.json` 같은 구방식과 달리 `eslint.config.js`가 **배열을 export**하고, 배열의 각 원소가 "이 파일 패턴에 이런 옵션/규칙을 적용한다"는 설정 블록. 여러 블록이 겹치는 파일에는 병합되어 적용된다. `defineConfig()`(from `eslint/config`)로 감싸면 타입 힌트/검증을 받을 수 있음.

### `sourceType: "module"` vs `"script"`
- `module`: `import`/`export` 문법을 쓰는 파일. ES 모듈로 로드되는 파일(`<script type="module">`, `"type": "module"` 매니페스트 설정 등)에 지정.
- `script`: 고전적인 스크립트(IIFE 등). 특히 브라우저 확장에서 `chrome.scripting.executeScript`로 **파일 내용 그대로 페이지/탭에 주입**되는 콘텐츠 스크립트는 모듈이 아니라 script여야 함 — 여기에 `import`를 쓰면 주입 시 실제로 에러가 남. 이 구분을 files 패턴별로 나눠 lint 시점에 실수를 잡을 수 있음.

### globals 설정
`globals` 패키지(`globals.browser`, `globals.serviceworker` 등)로 환경별 전역 변수 목록을 가져와 병합해서 씀. 브라우저 확장처럼 `chrome.*` API를 쓰는 경우 `chrome: "readonly"`처럼 커스텀 전역을 직접 추가. 이렇게 안 하면 `no-undef` 규칙이 정상적인 API 참조까지 "미선언 전역"으로 오탐함.

### 자주 쓰는 규칙들
- `no-unused-vars`: 선언하고 안 쓰는 변수를 에러로. `argsIgnorePattern: "^_"` 옵션을 주면 `_`로 시작하는 함수 인자는 예외 처리(콜백 시그니처는 맞춰야 하는데 실제로 안 쓰는 인자가 있을 때 관용적으로 사용, 예: `(err, _res) => ...`).
- `no-undef`: 선언되지 않은 전역 참조를 에러로. `globals` 설정과 반드시 짝을 이뤄야 함.
- `js.configs.recommended` (from `@eslint/js`): 개별 규칙을 하나씩 고르는 대신 "거의 항상 버그인" 패턴 수십 개(`no-dupe-keys`, `no-unreachable`, `no-constant-condition`, `no-fallthrough` 등)를 한 번에 켜주는 프리셋. 보통 이걸 베이스로 깔고 필요한 규칙만 위에 얹는 게 일반적인 시작점.
- `eqeqeq`: `==` 대신 `===` 강제. 타입 강제변환으로 인한 미묘한 버그 방지.
- `no-var` / `prefer-const`: `var` 금지 + 재할당 안 하는 변수는 `const` 강제. 스코프 관련 버그 예방.
- `curly`: `if (x) foo();`처럼 중괄호 생략한 한 줄 블록을 금지. 나중에 그 블록에 줄을 추가할 때 실수로 블록 밖으로 코드가 빠지는 사고를 방지.
- 스타일 계열(`indent`, `quotes`, `semi` 등)은 최근엔 ESLint가 아니라 Prettier로 넘기는 게 표준(아래 참고).

### `--fix` 옵션
`eslint . --fix`로 자동 수정 가능한 규칙(`curly`, `prefer-const`, 따옴표/세미콜론류 등)은 사람이 직접 안 고쳐도 됨. 다만 모든 규칙이 자동수정 가능한 건 아니고(`no-unused-vars` 등은 대부분 수동 판단 필요), 실행 후 diff를 검토하는 게 안전.

### `@eslint/js` 버전 주의
`eslint` 본체와 `@eslint/js`(`js.configs.recommended`가 들어있는 패키지)는 **버전 번호가 동기화되어 있지 않을 수 있음**. `eslint`가 10.9.1이라고 해서 `@eslint/js`도 10.9.1이 존재하는 건 아니었음(실제로는 10.0.1까지만 배포됨) — 설치 전에 `npm view @eslint/js versions`로 실제 존재하는 버전을 확인하는 게 안전.

## Prettier와의 역할 분담

Prettier는 **코드 포매터**(ESLint는 **검사기**). 들여쓰기·줄바꿈·따옴표·세미콜론 유무 등 "생김새"를 정해진 규칙대로 자동으로 다시 씀. 옵션이 의도적으로 거의 없음(opinionated) — 스타일 논쟁 자체를 없애자는 철학.

표준 관행:
- Prettier → 순수 스타일 (별도 명령 `prettier --write .`로 실행)
- ESLint → 코드 품질/버그 후보 (`no-unused-vars`, `eqeqeq` 등)

같이 쓸 때 ESLint의 스타일 규칙(`indent`, `quotes` 등)과 Prettier가 서로 다른 결론을 내면 두 도구가 계속 서로의 포맷을 되돌리는 "포맷팅 핑퐁"이 발생할 수 있음. 이를 막기 위해 `eslint-config-prettier`를 설치해서 config 배열의 **맨 마지막**에 넣으면 ESLint의 스타일 관련 규칙이 전부 꺼짐(Prettier와 충돌하는 규칙만 정확히 무력화하는 패키지).

```js
import prettierConfig from "eslint-config-prettier";
export default defineConfig([
  ...,
  prettierConfig, // 반드시 마지막
]);
```

도입 판단 기준: 협업자가 늘거나 파일이 많아져서 "diff에 포맷 변경만 잔뜩 섞이는" 문제가 실제로 생길 때 추가하는 게 합리적 — 개발자가 소수이고 파일 수가 적을 땐 ESLint 규칙 몇 개 추가하는 것 대비 우선순위가 낮음.
