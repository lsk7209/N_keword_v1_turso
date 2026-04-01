import dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import { getTursoClient } from "@/utils/turso";

async function run() {
  const db = getTursoClient();
  console.log("🚀 추가 인덱스 적용 중...");

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_search_desc ON keywords (total_search_cnt DESC)",
    "CREATE INDEX IF NOT EXISTS idx_keywords_tier_ratio ON keywords (tier, golden_ratio DESC)",
    "CREATE INDEX IF NOT EXISTS idx_tier_ratio_with_docs ON keywords (total_doc_cnt, tier, golden_ratio DESC) WHERE total_doc_cnt IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_cafe_opp_with_docs ON keywords (total_doc_cnt, cafe_doc_cnt ASC, total_search_cnt DESC) WHERE total_doc_cnt IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_blog_opp_with_docs ON keywords (total_doc_cnt, blog_doc_cnt ASC, total_search_cnt DESC) WHERE total_doc_cnt IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_web_opp_with_docs ON keywords (total_doc_cnt, web_doc_cnt ASC, total_search_cnt DESC) WHERE total_doc_cnt IS NOT NULL",
  ];

  for (const sql of indexes) {
    const name = sql.match(/idx_\w+/)?.[0] ?? sql;
    try {
      await db.execute(sql);
      console.log(`✅ ${name}`);
    } catch (e: any) {
      console.error(`❌ ${name}: ${e.message}`);
    }
  }
  console.log("🏁 완료");
}

run().catch(console.error);
