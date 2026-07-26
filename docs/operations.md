# 운영 안내

## 배포

운영 서버는 장기 실행 Node 프로세스와 PostgreSQL/PostGIS를 사용합니다. SSE 연결 때문에 요청 시간이 짧은 함수형 서버리스 환경은 사용하지 않습니다.

1. `POSTGRES_PASSWORD`, 32자 이상의 `BETTER_AUTH_SECRET`, 외부 HTTPS 주소인 `APP_BASE_URL`을 설정합니다.
2. `docker compose -f docker-compose.yml -f docker-compose.production.yml build`로 이미지를 만듭니다.
3. `docker compose up -d postgres` 후 `pnpm db:migrate`를 한 번 실행합니다. 운영 데이터베이스에서는 데모 시드를 실행하지 않습니다.
4. `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d web worker`로 앱과 작업자를 시작합니다.
5. `/api/health`가 200을 반환하는지 확인합니다.

역방향 프록시는 HTTPS를 종료하고 SSE 경로 `/api/chat/stream`의 응답 버퍼링을 꺼야 합니다. 배포 전에는 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`를 실행합니다.

## 백업과 복구

- 매일 한 번, 턴 공개 직전에 한 번 백업합니다.
- `powershell -File scripts/backup-db.ps1`은 `backups` 폴더에 PostgreSQL custom-format 백업을 만듭니다.
- 백업은 앱 서버와 분리된 저장소에 복사하고 최소 14일 보관합니다.
- 복구는 먼저 새 데이터베이스에서 검증합니다.
- 복구 명령: `powershell -File scripts/restore-db.ps1 -BackupFile <파일> -ConfirmRestore`
- 복구 후 health check, PostGIS 버전, 최근 턴, 지도 리비전, 최신 감사 로그를 확인합니다.

## 턴 운영 절차

1. 실패한 작업과 미검토 판정·사건이 없는지 확인합니다.
2. 데이터베이스 백업을 만듭니다.
3. 턴 잠금 → 계산 작업 생성 → 작업 실행 → 판정·사건 검토 순서로 진행합니다.
4. 공개 전 변경 요약을 확인하고 턴을 공개합니다.
5. 플레이어 계정으로 새 사건과 지표가 보이는지 확인합니다.

## 장애 대응

- 웹만 장애: worker와 DB를 유지하고 web 컨테이너만 재시작합니다.
- 작업 정체: AI 작업 화면에서 실패 코드와 시도 횟수를 확인한 뒤 공급자 설정을 점검합니다. 잠금 만료 작업은 worker가 회수합니다.
- 채팅 지연: DB 연결과 SSE 프록시 버퍼링을 확인합니다. 메시지 원본은 DB에 있으므로 새로고침으로 복구됩니다.
- 잘못된 관리자 변경: 감사 로그에서 변경 세트와 사유를 확인하고 새 수정 리비전으로 복구합니다. 공개 스냅샷을 직접 덮어쓰지 않습니다.
- 지도 충돌: 최신 리비전을 다시 불러온 뒤 변경을 재적용합니다.

## 보안 점검

- 운영 환경에서 데모 계정을 생성하지 않습니다.
- API 키와 세션 비밀값은 서버 환경변수로만 관리합니다.
- 관리자와 운영자 계정은 국가에 배정하지 않습니다.
- 사용자 정지, 타임아웃, 메시지 삭제, 수치·지도 변경은 감사 로그에서 정기적으로 확인합니다.
