#!/bin/bash
# Turso 인덱스 생성 스크립트
# 사용법: bash turso/create_indexes_now.sh

# turso CLI는 `turso auth login`으로 로그인된 세션을 사용합니다.
# TURSO_DATABASE_URL / TURSO_AUTH_TOKEN이 별도로 필요하면 실행 전 셸 환경에서 직접 export하세요 (여기에 하드코딩하지 마세요).

echo "🚀 Turso 인덱스 생성 시작..."
echo "데이터베이스: nkeword-igeonu377"
echo ""

# Turso CLI로 인덱스 생성
turso db shell nkeword-igeonu377 < turso/step_by_step_indexes.sql

echo ""
echo "✅ 인덱스 생성 완료!"

