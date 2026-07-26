# 가상국가 모의전 MVP

제품 지침서의 전체 8단계(Phase 0–7)를 구현한 PC 우선 웹 애플리케이션입니다. 국가 운영 원장과 연구, 연재 판정, 턴 공개, 사건·야당 행동, 외교, 전 지구 헥사곤 지도, 실시간 채팅과 운영 제재를 한 캠페인 흐름으로 제공합니다.

## 로컬 실행

Windows에서 Docker Desktop을 사용한다면 WSL 2 기능과 Linux 컨테이너 엔진이 먼저 활성화되어 있어야 합니다. `wsl --status`가 설치되지 않음으로 표시되면 관리자 권한 터미널에서 `wsl --install`을 실행하고 Windows를 재시작한 뒤 진행합니다.

1. `.env.example`을 `.env`로 복사하고 `BETTER_AUTH_SECRET`을 32자 이상의 임의 값으로 채웁니다.
2. `docker compose up -d postgres`로 PostgreSQL/PostGIS를 시작합니다.
3. `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:map`을 순서대로 실행합니다. 지도 생성은 H3 해상도 4의 전 지구 288,122셀을 한 번만 생성합니다.
4. `pnpm dev`를 실행하고 `http://localhost:3000`을 엽니다.
5. `pnpm health`로 데이터베이스와 PostGIS 연결을 확인할 수 있습니다.

전체 컨테이너 실행은 마이그레이션과 시드를 먼저 적용한 뒤 `docker compose up web worker`를 사용합니다. 로컬 판정은 기본적으로 결정론적 Fake 공급자를 사용하며, 실제 공급자 키는 서버 환경변수로만 설정합니다.

## 개발 전용 데모 계정

모든 데모 계정 비밀번호는 `Demo-password-2087`입니다. 이 계정은 `pnpm db:seed`에서만 생성되며 운영 빌드에서 자동 생성되지 않습니다.

- 관리자: `admin@virtual.local`
- 운영자: `moderator@virtual.local`
- 승인 국가 플레이어: `player1@virtual.local`
- 설정 검토 중 플레이어: `player2@virtual.local`
- 미배정 사용자: `user@virtual.local`

## 검증 명령

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`

실제 비밀값과 API 키는 커밋하지 않습니다. 이미지 지도 가져오기는 PNG/JPEG/WebP의 국가 색상을 헥사곤 소유권으로 변환하며 검은색·투명 픽셀은 국경으로 보고 제외합니다.

배포·백업·복구·장애 대응은 [운영 안내](docs/operations.md), 의도적으로 제외한 범위는 [알려진 제한 사항](docs/known-limitations.md)을 확인하세요.
