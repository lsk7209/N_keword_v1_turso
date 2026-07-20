// Turso 데이터베이스 테이블 및 인덱스 생성 스크립트
const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error(
    "❌ 환경 변수(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)가 설정되지 않았습니다.",
  );
  process.exit(1);
}

const client = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

async function executeSQL(sql) {
  try {
    const result = await client.execute(sql);
    return result;
  } catch (error) {
    console.error(`❌ SQL 실행 오류:\n${sql}\n오류:`, error.message);
    throw error;
  }
}

async function setupDatabase() {
  console.log("🚀 Turso 데이터베이스 설정 시작...\n");

  try {
    // STEP 1: 테이블 생성
    console.log("📋 STEP 1: 테이블 생성 중...");

    await executeSQL(`
            CREATE TABLE IF NOT EXISTS keywords (
                id TEXT PRIMARY KEY,
                keyword TEXT UNIQUE NOT NULL,
                total_search_cnt INTEGER DEFAULT 0,
                pc_search_cnt INTEGER DEFAULT 0,
                mo_search_cnt INTEGER DEFAULT 0,
                click_cnt INTEGER DEFAULT 0,
                pc_click_cnt INTEGER DEFAULT 0,
                mo_click_cnt INTEGER DEFAULT 0,
                total_ctr REAL DEFAULT 0,
                pc_ctr REAL DEFAULT 0,
                mo_ctr REAL DEFAULT 0,
                ctr REAL DEFAULT 0,
                comp_idx TEXT,
                pl_avg_depth INTEGER DEFAULT 0,
                avg_bid_price INTEGER DEFAULT 0,
                total_doc_cnt INTEGER,
                blog_doc_cnt INTEGER DEFAULT 0,
                cafe_doc_cnt INTEGER DEFAULT 0,
                web_doc_cnt INTEGER DEFAULT 0,
                news_doc_cnt INTEGER DEFAULT 0,
                tier TEXT DEFAULT 'UNRANKED',
                golden_ratio REAL DEFAULT 0,
                is_expanded INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
        `);
    console.log("✅ keywords 테이블 생성 완료");

    await executeSQL(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );
        `);
    console.log("✅ settings 테이블 생성 완료\n");

    // STEP 2: 기존 인덱스 생성
    console.log("📋 STEP 2: 기존 인덱스 생성 중...");

    const basicIndexes = [
      "CREATE INDEX IF NOT EXISTS idx_keywords_tier_ratio ON keywords (tier, golden_ratio DESC)",
      "CREATE INDEX IF NOT EXISTS idx_search_desc ON keywords (total_search_cnt DESC)",
      "CREATE INDEX IF NOT EXISTS idx_cafe_opp ON keywords (cafe_doc_cnt ASC, total_search_cnt DESC)",
      "CREATE INDEX IF NOT EXISTS idx_blog_opp ON keywords (blog_doc_cnt ASC, total_search_cnt DESC)",
      "CREATE INDEX IF NOT EXISTS idx_web_opp ON keywords (web_doc_cnt ASC, total_search_cnt DESC)",
      "CREATE INDEX IF NOT EXISTS idx_updated_at ON keywords (updated_at ASC)",
      "CREATE INDEX IF NOT EXISTS idx_ctr_desc ON keywords (total_ctr DESC)",
      "CREATE INDEX IF NOT EXISTS idx_pc_ctr_desc ON keywords (pc_ctr DESC)",
      "CREATE INDEX IF NOT EXISTS idx_mo_ctr_desc ON keywords (mo_ctr DESC)",
    ];

    for (const sql of basicIndexes) {
      await executeSQL(sql);
    }
    console.log("✅ 기존 인덱스 생성 완료\n");

    // STEP 3: 필수 인덱스 생성 (최우선)
    console.log("📋 STEP 3: 필수 인덱스 생성 중... (가장 중요!)");
    console.log("⏳ 예상 소요 시간: 15-25분\n");

    const criticalIndexes = [
      {
        name: "idx_keyword_lookup",
        sql: "CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword)",
        desc: "중복 체크 최적화",
      },
      {
        name: "idx_expand_candidates",
        sql: "CREATE INDEX IF NOT EXISTS idx_expand_candidates ON keywords (is_expanded, total_search_cnt DESC)",
        desc: "확장 대상 조회 최적화 (가장 중요!)",
      },
      {
        name: "idx_fill_docs_candidates",
        sql: "CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates ON keywords (total_doc_cnt, total_search_cnt DESC)",
        desc: "문서 수 채우기 최적화 (가장 중요!)",
      },
      {
        name: "idx_has_docs",
        sql: "CREATE INDEX IF NOT EXISTS idx_has_docs ON keywords (total_doc_cnt, total_search_cnt DESC)",
        desc: "필터링 + 정렬 최적화",
      },
      {
        name: "idx_created_at_range",
        sql: "CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at)",
        desc: "시간 범위 통계 최적화",
      },
    ];

    for (let i = 0; i < criticalIndexes.length; i++) {
      const { name, sql, desc } = criticalIndexes[i];
      console.log(
        `[${i + 1}/${criticalIndexes.length}] ${name} 생성 중... (${desc})`,
      );
      const startTime = Date.now();

      try {
        await executeSQL(sql);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ ${name} 생성 완료 (${elapsed}초)\n`);
      } catch (error) {
        console.error(`❌ ${name} 생성 실패:`, error.message);
        // Partial Index 에러인 경우 WHERE 절 제거한 버전으로 재시도
        if (
          error.message.includes("WHERE") ||
          error.message.includes("syntax")
        ) {
          console.log(`🔄 WHERE 절 제거 버전으로 재시도...`);
          const retrySql = sql.replace(/\s+WHERE\s+[^;]+/i, "");
          await executeSQL(retrySql);
          console.log(`✅ ${name} 생성 완료 (재시도 성공)\n`);
        } else {
          throw error;
        }
      }
    }

    // STEP 4: 통계 업데이트
    console.log("📋 STEP 4: 통계 업데이트 중...");
    await executeSQL("ANALYZE keywords");
    console.log("✅ 통계 업데이트 완료\n");

    // STEP 5: 최종 확인
    console.log("📋 STEP 5: 생성된 인덱스 확인...");
    const result = await executeSQL(`
            SELECT name FROM sqlite_master 
            WHERE type='index' AND tbl_name='keywords'
            ORDER BY name
        `);

    console.log("\n✅ 생성된 인덱스 목록:");
    result.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.name}`);
    });

    console.log("\n🎉 모든 작업 완료!");
    console.log("\n📊 예상 효과:");
    console.log("   - Rows Read: 99% 감소");
    console.log("   - 쿼리 시간: 95% 이상 개선");
  } catch (error) {
    console.error("\n❌ 오류 발생:", error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

setupDatabase();
