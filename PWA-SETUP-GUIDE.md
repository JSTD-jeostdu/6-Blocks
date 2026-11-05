# PWA 전환 v2 — 브랜드 에셋 통합 + P0 소형 수정 (Engineer → Jayden)

작업일: 2026-11-05 · 기준 커밋: `41a06b0` (main)

**이 zip이 이전 zip(sixblocks-pwa-2026-11-05.zip)을 완전히 대체합니다.**
v1 zip은 적용하지 말고 이 zip만 적용해 주세요. 만약 v1을 이미 적용하셨다면 `public/icons/` 폴더 전체를 삭제한 뒤 이 zip을 적용해 주세요 (아이콘이 public/ 루트로 이동했습니다).

## 이번 변경 내용 (v1 대비)

1. **Designer 브랜드 에셋 적용** (UX 감사 v1 §3 패키지) — 6레일 컬러마크 아이콘 세트, manifest, favicon 교체(보라색 템플릿 아이콘 → 6레일 SVG)
2. **앱명 "6 Blocks" 반영** — manifest name/short_name (Jayden님 2026-07-23 확정). index.html title도 동일하게. 코드 내 식별자(SixBlocks)는 유지
3. **인앱 스플래시** (§3.4) — index.html 인라인 퍼스트페인트(6레일 마크 + "6 Blocks" 워드마크 + 태그라인), 앱 마운트 시 300ms 페이드아웃
4. **동적 theme-color** (§3.3) — 라이트/다크 media 쿼리 meta 2개 + App 테마 토글 시 둘 다 갱신
5. **B1 수정** — 저녁 반성 화면의 덕목 라벨이 항상 "절제"로 고정되던 버그 → 이번 주 덕목 연결 (브라우저 실증: "결단 (Resolution)" 표시 확인)
6. **R7 수정** — `signInWithPopup` → `signInWithRedirect` (PWA standalone·iOS에서 popup 차단으로 로그인 실패 방지)
7. 서비스워커 v1.1.0 — 새 아이콘 경로 반영 + 캐시 버전 갱신 (기존 사용자 옛 캐시 자동 정리)

## 파일 목록 (전부 이 zip 안에 경로 그대로)

| 파일 | 구분 | 내용 |
|---|---|---|
| `index.html` | 수정 | §3.3 head 델타(manifest/apple-touch-icon/favicon 2종/theme-color 2종) + 인앱 스플래시 인라인 + title "6 Blocks" |
| `src/main.tsx` | 수정 | SW 등록 + 스플래시 페이드아웃 트리거 |
| `src/App.tsx` | 수정 | B1(EveningQuestion에 이번 주 덕목 전달) + theme-color 2개 meta 동기화 + PWA 컴포넌트 마운트 |
| `src/firebase.ts` | 수정 | R7: signInWithPopup → signInWithRedirect |
| `src/index.css` | 수정 | 설치 배너·오프라인 표시 스타일 (맨 아래 추가 블록) |
| `src/pwa.ts` | 신규 | SW 등록 모듈 (프로덕션만) |
| `src/InstallGuide.tsx` | 신규 | 설치 안내(Android 배너/iOS 가이드) + 오프라인 표시 |
| `public/manifest.webmanifest` | 신규 | Designer 완성본 + name/short_name "6 Blocks" 교체 |
| `public/favicon.svg` | 교체 | 보라색 로고 → 6레일 SVG (§3.1 색·비율 규격, PNG 아이콘과 동일 비율) |
| `public/favicon-64.png` | 신규 | 브라우저 탭용 (Designer) |
| `public/icon-192.png`, `public/icon-512.png` | 신규 | manifest any용 (Designer) |
| `public/maskable-512.png` | 신규 | 안드로이드 적응형 (Designer) |
| `public/apple-touch-icon.png` | 신규 | iOS 홈스크린 180×180 (Designer) |
| `public/sw.js` | 신규 | 서비스워커 v1.1.0 |
| `PWA-SETUP-GUIDE.md` | 신규 | 이 문서 |

## 적용 방법

1. **v1 zip을 적용하지 않았다면**: 이 zip을 풀어 경로 그대로 repo에 덮어쓰기 → commit → push to `main`
2. Actions 완료 후 라이브에서 확인

## 검증 방법 (로컬에서 이미 수행한 것과 동일)

```bash
npm ci && npm run build && npm run preview   # http://localhost:4173/6-Blocks/
```

- 빌드/tsc 통과, 단위테스트 10/10, lint 새 경고 0
- 실브라우저: 스플래시 표시→마운트 후 페이드아웃, 저녁 반성 덕목 라벨 "결단" 확인, **서버 중단 상태에서도 앱 완전 로드(SW 캐시)**, 다크모드 정상
- 폰: Android Chrome 설치 배너 / iPhone Safari 홈 화면 추가(아이콘·이름 "6 Blocks")

## push 후 라이브에서 꼭 확인할 것 (로컬에서 못 하는 것)

- **R7 리다이렉트 로그인**: 실제 구글 계정으로 로그인 1회 — redirect 후 복귀하여 동기화 상태가 "클라우드에 저장됨 ✓"이 되는지. (Firebase 콘솔의 승인된 도메인은 popup 때와 동일해서 별도 설정 불필요)
- iOS Safari "홈 화면에 추가" 후 standalone 모드에서 로그인 되는지 (popup 차단 환경에서의 R7 효과)

## 운영 노트

- 앱셸 목록 변경 시 `public/sw.js`의 `VERSION`을 올릴 것 (v1.1.0 → …)
- **표기명 통일 (Jayden님 결정 필요, 감사 리포트 §4)**: 앱 내 헤더는 아직 "SixBlocks"입니다. manifest/스플래시/탭은 "6 Blocks"로 통일됨 — 헤더도 바꿀지는 확정 후 알려주시면 1줄 반영
- 다크모드 아이콘은 별도 없음 (마스터 통일 — 감사 스펙)

## 다음 워크패키지 (Tech Lead P0, 이번 zip 미포함)

- App.tsx 1,466줄 파일 분리(컴포넌트/상수/훅/데모데이터) — 대규모 변경 전 충돌 방지 위해 선행
- B2 포커스 타이머: 상태 승격(탭 전환 유지) + focusSeconds 기록 + timestamp 기반 카운트
- P1: B4 모바일 순서 변경(포인터 이벤트/↑↓ 폴백), R5 Firebase 동적 import (번들 789KB)
