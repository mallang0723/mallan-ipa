# Marinara iOS — 작업 체크내역

**기준일:** 2026-10-07  
**계약:** [GOAL.md](GOAL.md) · [인계 명세](MARINARA_IOS_HANDOFF.md)  
**현재 상태:** 호스트·엔진·빌드 구현 및 Linux/Chromium 통합 확인. **Xcode/iPhone 미실행으로 전체 Goal 미완료. 서명된 IPA 없음.**

## 재개 지점

| 항목 | 현재 기록 |
|---|---|
| 저장소 / 브랜치 | `mallang0723/mallan-ipa` / `codex/ios-v1` |
| Goal 등록 | 호출 가능한 Goal 도구를 찾지 못함. 등록했다고 주장하지 않고 GOAL의 완료 조건을 따라 작업 |
| 원본 소스 | `engine/`, 원본만의 커밋 `1ca7c63`과 실제 iOS 수정을 구분 |
| 다음 작업 | Mac에서 README 명령 → Xcode 컴파일/실행 → 실제 네이티브 오류 수정 → iPhone 완료 조건 확인 |
| 필요한 외부 입력 | macOS/Xcode, iPhone, 본인 Team/서명, 앱에 입력할 허용된 API 연결 |
| 원격 작업 | 작업 저장소 `codex/ios-v1` 푸시 시 GitHub 403. 연결 계정 `syhekate`에 쓰기 권한 없음. 원격 변경/PR 생성 없음. upstream 푸시·배포·유료 호출 없음 |

이전에는 인계 문서만 있었다. 이번에는 실제 코드 작성과 실행을 진행했다. 새 세션에서 설계부터 다시 시작하거나 Linux 결과를 iPhone 성공으로 바꾸지 않는다.

구현 커밋은 `1f7cfe2`다. 원격 권한 문제의 대체 전달물은 `ios/build/marinara-ios-v1.bundle`이며 소스와 Git 이력만 담는다. IPA가 아니다. Mac으로 파일을 옮긴 뒤 `git clone -b codex/ios-v1 /파일/경로/marinara-ios-v1.bundle mallan-ipa-ios`로 복원하고 README를 따른다. 원격 PR은 해당 저장소 쓰기 권한이 있는 GitHub 연결이 필요하다.

## 환경과 기준

- 개발/검증: Linux x64, Node 24.19.0, pnpm 10.34.5, `/usr/bin/chromium`.
- Engine: `7e28236962a000719dddc13f7fa2630f88b51816` / 2.5.0.
- Agents fixture: `e816c5ba9bf74f68abedc24e4791471f59b8e1c0`.
- 내장 NodeMobile: `v24.21.0-0`, release commit `9434fdd4809447d2469adbbac3cb55b41d533731`. 후보 recipe `3f2d000e0336d3c2c8fc5ca37d62292fafbf55e4`와 구별한다.
- 공식 HTTPS ZIP SHA-256: `11ce3f366dc5f5f2f58a35186b257edc4fa365f2aeb1c0fe963c35728495b492`. 다운로드·검증·압축 해제를 실제 수행했다.
- 프로젝트 대상: iOS 17+, 기기 arm64 / 시뮬레이터 arm64. 실제 Xcode·기기 버전은 미확인.

## 작성한 코드

- Xcode 프로젝트/공유 scheme, Swift/ObjC++ 호스트, 실제 `node_start()` 전용 스레드. 앱 프로세스당 한 번 시작한다. Info.plist와 scheme XML은 파싱 확인했으나 **Xcode 컴파일은 확인하지 못했다.**
- Keychain 암호화 키, 앱 전용 데이터 디렉터리, HMAC 서버 신원 확인, HttpOnly WKWebView 세션, native 전용 lifecycle 요청.
- 원본 UI의 WKWebView, 외부 링크 처리, WKDownload/공유 시트, JS 대화상자, 웹 콘텐츠 프로세스 종료 시 재연결. 가져오기는 WebKit 기본 파일 picker. **Files/공유 시트는 기기 확인 대기.**
- iOS 서버 진입점과 인증/기능 경계. 원본 supervisor 및 `process.exit()` 재시작을 사용하지 않는다. 백그라운드에서는 생성과 agent tail을 취소하고 저장 경로가 끝난 후 flush한다. 신규 생성/서버 자율 생성도 제한한다.
- 공식 패키지 로더와 해시 검사 유지. iOS에서 CLI SDK helper 링크만 제외하고, 앱 갱신으로 번들 위치가 바뀌면 관리 중인 의존성 symlink를 재연결한다. 내부 `app.inject()`에 웹 세션만 전달한다.
- 개인 Server Extension, Professor Mari workspace/shell, CLI 구독 provider 거부. 기존 HTTP provider, 파일 DB, 핵심 UI 유지. ONNX/sharp/로컬 모델/CLI 의존성은 앱 자산에서 제외.
- 암호화 키는 파일에 복제하지 않고 Keychain에서 환경으로 전달. 앱 데이터를 iCloud 백업에서 제외. iOS portable profile에서 `extension-storage:*` 설정 제외. 원본 전체 파일 백업은 민감한 자료임을 안내.
- iOS 안내, 동일 창 다운로드, 내장 앱의 PWA worker 등록 제외. 수정된 확장을 옛 해시로 승인하면 일반 500 대신 설명 있는 409 반환. 승인 비교는 유지.
- 런타임 다운로드·검증, production 리소스 배치, 서명된 기기 앱의 IPA 포장 스크립트. **포장 스크립트는 구문 확인만 수행했다.**

## 실행 결과

| 흐름/명령 | 결과 | 실제 범위 |
|---|---|---|
| `node scripts/fetch-ios-runtime.mjs` | 통과 | 고정 HTTPS ZIP·SHA·XCFramework 설치. 네이티브 실행 아님 |
| `node scripts/build-ios.mjs --stage-only` | 통과 | 실제 빌드된 엔진 + 189개 production 패키지, 약 292 MiB. 외부 symlink/미포팅 native binary 거부 |
| `corepack pnpm check` | 통과 | localization/format/lint/타입/서버·클라이언트 production 빌드 전체 통과 |
| `corepack pnpm regression:extensions-security` | 1/1 통과 | 원본 승인·해시·브라우저 정책. OS namespace 제약으로 개인 Server Extension 실행 부분은 원본 테스트가 skip; iOS 제외 기능 |
| 인증·UI 제공 | 통과 | 실제 iOS 진입점 HTTP, HMAC, 무인증 401, 다른 Origin 403, 웹의 native lifecycle 거부, restart 501 |
| 채팅/스트리밍/중지 | 통과 | 실제 provider HTTP 경로에 로컬 **모의 API** 사용. 유료/실제 사용자 API 호출 없음 |
| PNG/JSON/로어북/저장 | 통과 | JSON 카드 import → PNG export/import, 로어북, 생성 메시지, Node 완전 종료·재실행 후 복원·세션 교체 |
| lifecycle | 통과 | 진행 중 생성 취소·저장, background 신규 생성 거부. iOS suspension 확인은 아님 |
| 잘못된 API 키 | 통과 | 모의 API 401이 생성 오류로 전달되고 active generation이 해제됨 |
| 공식 설치/에이전트 | 통과 | 고정 공식 catalog/ZIP 바이트로 실제 설치기/해시 검사, 재실행, Character Tracker 결과 반영 |
| Tic-Tac-Toe | 통과 | server.mjs 활성화, 게임 시작, 검증된 client.js 제공, Chromium의 실제 상태 렌더링 |
| Browser/Full-page | 통과 | 실제 JS/storage/DOM, 비활성화, 옛 해시 거부·새 해시 재승인. native UA 표시가 있는 Chromium, PWA worker 미등록 확인 |
| portable profile | 통과 | 연결 키와 확장 설정의 테스트 키 제외 |
| 사용자 예시 확장 3개 | 마운트/해제 통과 | 원본 JS 승인 → 위젯 생성 → 비활성화. 전체 업무/잔액 API는 미확인 |

통합 명령:

```bash
MARINARA_AGENTS_FIXTURE_DIR=/workspace/Marinara-Agents \
MARINARA_EXTENSION_FIXTURE_ROOT=/workspace \
node scripts/smoke-ios.mjs
```

스모크는 앱에 넣는 `ios/Resources/engine`을 별도 프로세스로 실행하고 임시 데이터만 사용·삭제한다. 직접 DNS가 제한된 클라우드에서 **테스트에 한해** 공식 HTTPS 카탈로그/ZIP 전송을 고정 체크아웃의 바이트로 대체했다. 설치기·아카이브/파일 해시·로더는 대체하지 않았다. 실제 iPhone HTTPS 다운로드와 NodeMobile 네트워크 구현은 추가 확인해야 한다.

## 확인한 패키지

| 패키지 | 버전/기준 | 결과 |
|---|---|---|
| Character Tracker | 1.1.1 | 정의 로드, 모의 API의 `hopeful` 결과를 실제 game-state에 저장 |
| Tic-Tac-Toe | 1.0.5 | server activate·게임 시작·client 렌더링 |
| 작은 Browser/Full-page fixture | 테스트용 | sandbox/storage/UI/DOM/cleanup/변경 재승인 |
| marinara-docs-tutor | `367a2520` | 원본 Full-page 위젯 마운트/해제 |
| marinara-balance-widget | `23166e54` | 원본 위젯 마운트/해제. 별도 CLI 제외 |
| marinara-worldmarble-tour | `cb8bb158` | 원본 위젯 마운트/해제 |

## 실패와 수정

- legacy pnpm deploy는 frozen 옵션에도 범위를 재해석하고 offline metadata에서 실패했다. 재해석 없이 설치된 production graph를 복사하도록 바꿨다.
- 제외한 CLI SDK의 native helper 링크가 부팅 중 실패했다. iOS에서는 해당 링크만 제외해 공식 server.mjs 경로를 보존했다.
- 변경 확장 승인 오류가 일반 500으로 숨겨졌다. 실행 거부를 유지하고 409/재검토 안내로 수정했다.
- 새 영어 키 정렬과 두 파일의 Prettier 형식을 저장소 검사에 맞게 수정했다. 번역 파일 전체를 손대지 않았다.

## 남은 완료 조건 / 중단 이유

독립적으로 가능한 호스트·서버·빌드·파일·플랫폼 구현과 통합 확인을 진행했다. 이 Linux 환경에는 Xcode/Apple SDK/iPhone/개인 서명이 없고, 허용된 실제 API 연결도 제공되지 않았다. 다음은 모두 **미완료**다.

- [ ] Xcode Swift/ObjC++ 컴파일·링크·서명 및 NodeMobile 실제 부팅.
- [ ] WKWebView의 원본 화면, Browser sandbox, Full-page, 공식 게임 클라이언트.
- [ ] iPhone에서 허용된 실제 API 채팅·스트리밍·중지.
- [ ] Files PNG/JSON 가져오기·공유 시트 내보내기, 강제 종료·재실행·서명 갱신 후 저장 유지.
- [ ] 실제 suspension, 키 오류/연결 끊김/저장 오류의 기기 동작.
- [ ] 개인 Team 설치 및 필요한 경우 서명 앱 IPA 포장.

그룹/RP/기본 Game 코드는 보존했다. 모의 Roleplay/Tracker와 Conversation Tic-Tac-Toe 외 전체 게임 진행, 거대 자산 성능, 모든 공급자·에이전트 호환을 주장하지 않는다. 남은 고급 기능은 GOAL의 제외 범위를 유지한다. Xcode 결과가 오면 해당 오류부터 이어서 수정한다.
