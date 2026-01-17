import { getTursoClient, getCurrentTimestamp } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function fixStaleRows() {
    const db = getTursoClient();

    // 1. Identify stale rows (NULL doc count but updated cleanly long ago? No, if it was updated long ago it's fine.
    // The issue is they are being picked up and NOT updated.
    // So let's target the known problem keywords first.

    // Also target any keyword that is currently NULL but has high search volume, 
    // to see if we can "unstick" them.

    // Using the list from the user's log:
    const targets = [
        '대한항공', '항공권', '항공권예매', '크리스마스이브', '비행기표예약',
        '핀터레스트', '코레일', '애슐리퀸즈', '약국', '새해인사', '새해인사말',
        'KTX', '연봉계산기'
    ];

    console.log(`Fixing ${targets.length} specific stuck keywords...`);

    const placeholders = targets.map(() => '?').join(',');

    // We will set total_doc_cnt = 0 for now to stop the loop.
    // They will be updated properly later if they are re-expanded, but this breaks the 'fill_docs' loop.
    const res = await db.execute({
        sql: `UPDATE keywords 
              SET total_doc_cnt = 0, updated_at = ? 
              WHERE keyword IN (${placeholders}) 
              AND total_doc_cnt IS NULL`,
        args: [getCurrentTimestamp(), ...targets]
    });

    console.log(`Updated ${res.rowsAffected} rows.`);
}

fixStaleRows();
