#!/bin/bash
# Turso 인덱스 생성 스크립트
# 사용법: bash turso/create_indexes_now.sh

# 환경 변수 설정
export TURSO_DATABASE_URL="libsql://nkeword-igeonu377.aws-ap-northeast-1.turso.io"
export TURSO_AUTH_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjYwMTM1NjIsImlkIjoiOTdmODdhYTQtY2E1MS00NWNhLWJhZWItYzBhMjQ3Y2JhZWM5IiwicmlkIjoiYzllZWNhMWMtMmM3MS00ZjA2LTk4M2QtYzBkYTM2NmM2ZjcxIn0.8odlDbEiAl-Cq61vRNOrey6jjuHfQmAO1A57laXz_tNxzmRc79D5d7Pa6r4brtjam8gTrxDjEmpyTL36gOIOCQ"

echo "🚀 Turso 인덱스 생성 시작..."
echo "데이터베이스: nkeword-igeonu377"
echo ""

# Turso CLI로 인덱스 생성
turso db shell nkeword-igeonu377 < turso/step_by_step_indexes.sql

echo ""
echo "✅ 인덱스 생성 완료!"

