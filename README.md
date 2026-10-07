# Marinara iOS v1

Marinara Engine **2.5.0**을 iPhone 안에서 실행하기 위한 개인용 포트입니다. Swift/WKWebView와 내장 Node 24가 원본 React/Fastify/파일 저장소를 실행합니다. 외부 API 연결은 앱에서 직접 설정합니다.

**현재: 구현 및 Linux/Chromium 통합 확인 단계. Xcode 컴파일·시뮬레이터·iPhone 실행·서명된 IPA는 아직 확인하지 못했습니다. 전체 v1 완료 상태가 아닙니다.** 실제 진행 결과는 [WORKLOG](docs/ios/WORKLOG.md), 완료 조건은 [GOAL](docs/ios/GOAL.md)에 있습니다.

## Mac에서 빌드하고 설치하기

필요한 환경: Xcode 16 이상과 iOS SDK, Node **24**, Corepack, iPhone **iOS 17 이상**. 제공 런타임의 시뮬레이터 슬라이스는 **Apple Silicon arm64 전용**입니다. Intel Mac 시뮬레이터는 지원하지 않습니다.

저장소 루트에서 실행합니다. 빌드 시에는 인터넷이 필요합니다.

```bash
cd engine
ONNXRUNTIME_NODE_INSTALL=skip corepack pnpm install --frozen-lockfile
cd ..
node scripts/fetch-ios-runtime.mjs
node scripts/build-ios.mjs
open ios/Marinara.xcodeproj
```

`ONNXRUNTIME_NODE_INSTALL=skip`은 원본의 추가 ONNX 바이너리 설치를 생략하는 옵션입니다. iOS 앱에는 ONNX, sharp, 로컬 모델 및 구독 CLI 의존성을 넣지 않습니다. 원본 잠금 파일은 유지하며, 빌드 스크립트는 설치된 실행 의존성과 엔진 자산을 `ios/Resources/engine`에 복사합니다. Node 프레임워크는 [runtime-lock.json](ios/runtime-lock.json)의 HTTPS URL과 SHA-256으로 고정합니다.

1. Xcode → Marinara target → Signing & Capabilities에서 본인의 Team을 선택하고 Automatically manage signing을 켭니다.
2. Bundle Identifier를 본인에게 고유한 값으로 정하고 **이후 갱신할 때도 같은 값**을 사용합니다. 인증서와 Team 설정을 저장소에 커밋하지 마세요.
3. iPhone을 연결하고 Developer Mode를 켠 뒤 기기를 실행 대상으로 선택해 Run 합니다. 필요한 신뢰 설정은 iPhone 설정에서 완료합니다.
4. 앱의 Connections에서 외부 HTTP API의 주소·키·모델을 입력합니다. 정상 HTTPS 인증서 검증을 유지합니다. 구독 계정 CLI 로그인 방식은 v1에서 사용할 수 없습니다.

무료 Personal Team은 보통 7일 후 재서명이 필요합니다. Mac에서 같은 프로젝트·Team·Bundle Identifier로 다시 Run 하세요. **앱을 삭제하지 마세요.** 삭제하면 대화와 캐릭터 데이터가 사라집니다. 갱신 전 Settings의 Export Profile로 Files에 내보내 두는 것을 권장합니다.

시뮬레이터용 명령은 다음과 같습니다. 이 Linux 환경에서 실행한 명령은 아닙니다.

```bash
xcodebuild -project ios/Marinara.xcodeproj -scheme Marinara \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build/DerivedData CODE_SIGNING_ALLOWED=NO build
```

IPA가 별도로 필요하면 Xcode가 **실제 기기용으로 서명한** `.app`을 포장할 수 있습니다. 이 스크립트는 서명과 프로비저닝 존재를 확인하고 Payload ZIP을 만들며, 인증서를 만들거나 서명 만료를 연장하지 않습니다. 무료 계정의 우선 설치 경로는 위의 Xcode Run입니다.

```bash
bash scripts/package-ipa.sh /실제/빌드/경로/Marinara.app ios/build/Marinara.ipa
```

## 앱 동작과 범위

- 원본 채팅·캐릭터 PNG/JSON·로어북·그룹/RP/Game 코드와 공식 에이전트 설치/로더를 유지합니다. Character Tracker, Tic-Tac-Toe는 아래 통합 확인에 포함됩니다. 모든 고급 기능의 iPhone 호환을 확인한 것은 아닙니다.
- Browser 확장과 승인한 Full-page 확장을 원본 방식으로 불러옵니다. Settings의 Danger Zone에서 외부 확장을 허용하고, 각 코드의 해시와 권한을 검토해 승인해야 합니다. Full-page 코드는 본체의 DOM·대화·연결에 접근할 수 있습니다. 코드가 바뀌면 다시 승인해야 합니다.
- 공유한 세 확장은 `extension/manifest.json`과 `extension.js`를 함께 원본 ZIP/파일 가져오기로 가져오세요. 구형 `marinara.extension` 형식은 원본 importer가 Full-page 권한으로 해석합니다. 독립 CLI인 balance.mjs는 앱 확장에 포함하지 않습니다.
- 앱을 백그라운드로 보내면 진행 중인 생성을 중단하고 저장을 시도합니다. 저장 확인에 실패하면 안내를 표시합니다. 응답을 자동으로 재전송하지 않습니다. 패키지가 재시작을 요구하면 앱을 완전히 종료하고 다시 여세요.
- 개인용 Server Extension, 로컬 ONNX/Python/MLX 모델, Professor Mari 워크스페이스/셸, Calls, 외부 장치, 멀티플레이, 엔진 OTA는 v1 범위 밖입니다. 공식 패키지의 `server.mjs`는 별도 경로이므로 유지합니다. sharp가 필요한 변환/배경 제거는 제외되며, PNG 카드와 원본 이미지 파일 처리는 유지합니다. PNG가 아닌 아바타의 PNG 내보내기는 원본의 빈 PNG 대체 경로를 사용합니다.

## 데이터와 키

엔진 데이터는 앱의 `Library/Application Support/Marinara`에 저장합니다. 연결 키는 원본 암호화 형식으로 저장하고, 암호화 마스터 키는 iOS Keychain에만 보관해 Node 환경으로 전달합니다. 확장 자체 저장소에는 확장 구현에 따라 키가 평문으로 들어갈 수 있습니다.

따라서 앱 데이터 디렉터리는 iCloud 백업에서 제외합니다. **Export Profile은 연결 키 및 확장 설정 저장소를 제외**합니다. 복원 후 키와 확장 설정을 다시 입력해야 합니다. 원본의 전체 파일 백업은 확장 비밀 값을 포함할 수 있는 민감한 파일입니다. Keychain 키가 없는 다른 설치에서는 암호화된 연결 키를 복구할 수 없습니다.

서버는 `127.0.0.1:7860`에만 바인딩합니다. 호스트가 HMAC으로 서버 신원을 확인한 뒤 WebKit에 HttpOnly 세션 쿠키를 넣습니다. 기존 출처·CSRF·패키지 무결성·확장 승인을 유지합니다. 외부 페이지나 확장에 Keychain/파일 시스템/셸용 네이티브 JS 브리지를 제공하지 않습니다.

## 이 환경에서 실행한 확인

`engine`의 `corepack pnpm check`와 루트의 `scripts/smoke-ios.mjs`를 사용합니다. 스모크는 앱에 넣을 **동일한 JS 리소스**를 별도 Node 프로세스에서 띄워 모의 API, 가져오기/내보내기, 저장/재실행, 공식 패키지, 확장을 확인합니다. 포트 7860이 사용 중이면 중단합니다. 임시 테스트 데이터만 사용합니다.

```bash
# 고정된 공식 Agents 체크아웃을 별도 디렉터리에 준비한 경우
MARINARA_AGENTS_FIXTURE_DIR=/경로/Marinara-Agents \
CHROMIUM_PATH=/경로/chromium node scripts/smoke-ios.mjs
```

Agents fixture는 `e816c5ba9bf74f68abedc24e4791471f59b8e1c0`을 요구합니다. 클라우드의 직접 DNS 제약 때문에 테스트에서만 공식 카탈로그/ZIP 전송을 그 체크아웃의 바이트로 대체합니다. 설치·해시 검사·서버 로더는 실제 엔진 코드입니다. 실제 iPhone 네트워크 다운로드나 WKWebView 검증을 대신하지 않습니다. 세 예시 확장의 체크아웃이 한 디렉터리 아래 있으면 `MARINARA_EXTENSION_FIXTURE_ROOT`로 지정해 마운트/해제도 확인할 수 있습니다.

## 출처와 라이선스

`engine/`은 [Marinara Engine](https://github.com/Pasta-Devs/Marinara-Engine)의 `7e28236962a000719dddc13f7fa2630f88b51816`(2.5.0)을 가져와 필요한 iOS 경계만 수정했습니다. 엔진의 [AGPL-3.0 라이선스](engine/LICENSE)와 저작권 고지를 보존합니다. 이 포트의 새 호스트/스크립트도 AGPL-3.0으로 제공합니다. 기존 작업 저장소의 루트 LICENSE는 보존했습니다. NodeMobile의 고정 버전·출처는 [runtime-lock.json](ios/runtime-lock.json), Node 및 포함 라이브러리 고지는 [NodeMobile-LICENSE](ios/NodeMobile-LICENSE)에 있습니다.
