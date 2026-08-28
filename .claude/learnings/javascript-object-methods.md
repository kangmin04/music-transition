# JavaScript `Object` 관련 메서드 — 언제, 왜 쓰는가

## 2026-08-29 — music-controller.js / music-volume-lock.js / service-worker.js 코드를 설명하며 정리

이 프로젝트에서 실제로 쓴 것부터, 알아두면 좋은데 아직 안 쓴 것까지 묶어서 정리. 각 메서드마다 "이 상황을 보면 이 메서드가 필요하다는 신호"를 같이 적어둠 — 코드를 짤 때 "이런 게 있었지" 하고 떠올릴 수 있게.

---

### `Object.getOwnPropertyDescriptor(obj, key)` — 속성이 "진짜로 어떻게" 정의됐는지 알아내기

**뭘 하는가**: 어떤 객체의 특정 속성이 데이터 속성(`{value, writable, ...}`)인지 접근자 속성(`{get, set, ...}`)인지, 그리고 그 실제 함수/값이 뭔지 통째로 돌려준다.

**언제 필요하다고 판단하는가**: "이 속성의 **원래 동작**을 나중에도 계속 쓸 수 있어야 하는데, 지금 그 속성을 덮어씌우려는" 상황. 덮어씌우기 전에 원본을 붙잡아두지 않으면 원본 동작 자체가 사라져서 되돌릴 수 없다.

**이 프로젝트 예시** (`music-volume-lock.js`, `music-controller.js`):
```js
const nativeVolume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
```
`<video>.volume`은 실제로 브라우저 내부 함수가 읽기/쓰기를 처리하는 접근자 속성이다. 이 값을 뒤에서 `Object.defineProperty`로 덮어씌울 계획이니, 덮어씌우기 **전에** 진짜 getter/setter 함수를 `nativeVolume.get`/`nativeVolume.set`에 저장해뒀다 — 안 그러면 진짜 볼륨을 읽고 쓸 방법 자체가 없어진다.

---

### `Object.defineProperty(obj, key, descriptor)` — 속성을 getter/setter로 재정의하기

**뭘 하는가**: 객체에 새 속성을 정의하거나 기존 속성을 완전히 새로운 규칙(데이터 속성 ↔ 접근자 속성 포함)으로 재정의한다. 일반적인 `obj.key = value` 대입으로는 "값을 읽거나 쓸 때 함수를 가로채는" 접근자 속성을 만들 수 없다 — 이게 필요하면 `defineProperty`(또는 객체 리터럴의 `get`/`set` 문법) 둘 중 하나를 반드시 써야 한다.

**언제 필요하다고 판단하는가**: "이 속성에 값이 들어올 때(또는 나갈 때) 내가 끼어들어서 뭔가 하고 싶다"는 요구가 생기면 — 로깅, 검증, 값 강제(clamping), 이번처럼 **다른 값으로 바꿔치기** 등. 평범한 대입/조회로는 끼어들 지점이 없다는 걸 깨달았을 때가 신호.

**이 프로젝트 예시** (`music-volume-lock.js`):
```js
Object.defineProperty(el, "volume", {
  configurable: true,
  get() { return nativeVolume.get.call(el); },
  set(value) { nativeVolume.set.call(el, desiredVolume ?? value); },
});
```
누가 `.volume`에 뭘 대입하든(사이트 자신의 스크립트 포함) `set`이 가로채서 우리가 원하는 값으로 바꿔치기한다. `configurable: true`를 명시한 이유: 기본값이 `false`라서, 빼먹으면 이후 이 속성을 다시 재정의하거나 지울 수 없게 잠겨버린다.

**참고**: `el`(그 인스턴스 하나) 위에 정의했지 `HTMLMediaElement.prototype`에 정의한 게 아니다. 자바스크립트는 속성을 찾을 때 "자기 자신 → 프로토타입" 순서로 올라가므로(프로토타입 체인), 인스턴스 자신에게 있는 속성이 프로토타입 걸 가린다(shadowing). 그래서 이 잠금은 **딱 그 엘리먼트 하나**에만 적용되고 다른 `<video>`엔 영향이 없다.

---

### `Object.keys(obj)` — 객체가 "비어있는지" 확인하거나 순회하기

**뭘 하는가**: 객체 자신의 열거 가능한(enumerable) 속성 이름들을 배열로 돌려준다.

**언제 필요하다고 판단하는가**: 객체를 `for...in`으로 돌리고 싶을 때, 또는 (이번 예시처럼) **"이 객체에 뭐라도 들어있나?"를 확인**하고 싶을 때. `.length === 0`이면 빈 객체라는 뜻.

**이 프로젝트 예시** (`service-worker.js`, `chrome.tabs.onRemoved` 핸들러):
```js
const patch = {};
if (settings.lectureTabId === tabId) { patch.lectureTabId = null; /* ... */ }
if (settings.musicTabId === tabId) { patch.musicTabId = null; /* ... */ }
if (Object.keys(patch).length) {
  await updateSettings(patch);
}
```
닫힌 탭이 강의/음악 탭 중 어느 것도 아니면 `patch`는 빈 객체로 남는다. 이때 굳이 `chrome.storage.local.set`을 호출할 필요가 없으니, `Object.keys(patch).length`로 "정말 바뀐 게 있을 때만" storage 쓰기를 하도록 걸러낸다 — 불필요한 쓰기를 피하는 흔한 패턴.

**같이 알아두면 좋은 형제들**:
- `Object.values(obj)`: 값들만 배열로.
- `Object.entries(obj)`: `[key, value]` 쌍의 배열로 — `for (const [k, v] of Object.entries(obj))`처럼 키·값을 동시에 순회하고 싶을 때.
- `Object.fromEntries(entries)`: `entries`의 반대 — `[[k,v], ...]` 형태를 다시 객체로 조립. 배열 메서드(`map`/`filter`)로 객체를 변형하고 싶을 때 `Object.entries` → 배열 가공 → `Object.fromEntries`로 되돌리는 흐름이 표준 패턴.

---

### 스프레드(`{...a, ...b}`) — `Object.assign`의 최신 문법

엄밀히는 `Object` 메서드가 아니라 문법이지만, **`Object.assign({}, a, b)`과 정확히 같은 일**을 하므로 묶어서 알아두면 좋다.

**뭘 하는가**: 여러 객체의 속성을 순서대로(뒤에 오는 게 앞의 것을 덮어씀) 합쳐 **새 객체**를 만든다. 원본 객체는 안 바뀐다(불변성 유지).

**언제 필요하다고 판단하는가**: "기존 상태에 일부만 바꾼 새 상태를 만들고 싶다"(불변성을 지키며 상태 갱신하는 리듀서 패턴)는 요구가 있을 때. `obj.key = value`로 원본을 직접 고치면 그 객체를 참조하던 다른 곳까지 같이 바뀌어버리는 부작용이 생길 수 있는데, 스프레드/assign은 항상 새 객체를 만들어서 그 위험을 피한다.

**이 프로젝트 예시** (`service-worker.js`):
```js
async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}
async function updateSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
```
`getSettings`는 기본값 위에 저장된 값을 덮어써서 "저장된 적 없는 새 필드는 기본값으로 자동 채워지는" 효과를 낸다(`realStopActive`가 나중에 추가됐을 때도 기존 사용자 storage를 마이그레이션할 필요가 없었던 이유). `updateSettings`는 현재 설정 위에 patch만 덮어써서 "일부 필드만 바꾸는" 갱신을 구현한다.

---

### 아직 안 썼지만 알아두면 좋은 것들

- **`Object.freeze(obj)` / `Object.isFrozen(obj)`**: 객체 전체를 통째로 "더 이상 못 바꾸게" 잠근다(속성 추가/삭제/값 변경 전부 막힘, strict mode에선 시도 시 에러). `defineProperty`로 속성 하나를 특별하게 만드는 것과는 결이 다르다 — freeze는 "이 객체는 이제 상수다"를 선언하는 도구, defineProperty는 "이 속성은 특별한 규칙으로 동작한다"를 만드는 도구.
- **`Object.seal(obj)`**: freeze보다 약함 — 속성 추가/삭제는 막지만, 이미 있는 속성의 값은 바꿀 수 있게 둔다.
- **`Object.getPrototypeOf(obj)` / `Object.setPrototypeOf(obj, proto)`**: 어떤 객체의 프로토타입을 읽거나 바꾼다. `el.volume`을 찾을 때 자바스크립트가 타고 올라가는 그 체인을 직접 들여다보거나 조작하는 저수준 도구 — [[chrome-isolated-vs-main-world]] 노트에서 다룬 "왜 인스턴스에 정의한 속성이 프로토타입 걸 가리는가"를 코드로 확인하고 싶을 때 `Object.getPrototypeOf(el) === HTMLMediaElement.prototype` 같은 식으로 써볼 수 있다.
- **`Object.create(proto)`**: 지정한 객체를 프로토타입으로 삼는 새 객체를 만든다. 클래스 문법이 나오기 전에 프로토타입 상속을 직접 구현하던 방식.
- **`enumerable` 플래그와 `Object.keys`의 관계**: `defineProperty`에서 `enumerable`을 안 적으면 기본값이 `false`가 된다. 이 프로젝트의 `lockVolume`이 정확히 이 상태 — `el.volume`으로 직접 접근하는 건 멀쩡히 되지만, `Object.keys(el)`이나 `for...in`으로 순회하면 `volume`이 목록에 안 뜬다. "속성은 있는데 왜 순회할 때 안 보이지?"를 마주치면 이 플래그를 의심해보면 된다.
