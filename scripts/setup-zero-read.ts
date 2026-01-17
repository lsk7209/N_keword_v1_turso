/**
 * 🚀 Zero-Read Optimization Setup
 * 
 * 1. UNIQUE INDEX 생성
 * 2. In-Memory Cache 초기화
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getTursoClient } from '@/utils/turso';
import { keywordCache } from '@/utils/keyword-cache';
import fs from 'fs';
import path from 'path';

async function setup() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Turso Zero-Read Optimization Setup');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const db = getTursoClient();

    // Step 1: Apply UNIQUE INDEX
    console.log('[1/2] 📐 Creating UNIQUE INDEX on keywords(keyword)...');
    try {
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '../migrations/001_add_unique_index.sql'),
            'utf-8'
        );

        await db.execute(migrationSQL.trim());
        console.log('✅ UNIQUE INDEX created successfully\n');
    } catch (error: any) {
        if (error.message.includes('already exists')) {
            console.log('✅ UNIQUE INDEX already exists\n');
        } else {
            console.error('❌ Failed to create index:', error);
            throw error;
        }
    }

    // Step 2: Initialize Keyword Cache
    console.log('[2/2] 💾 Initializing In-Memory Keyword Cache...');
    try {
        await keywordCache.init();
        const stats = keywordCache.getStats();
        console.log(`✅ Cache initialized with ${stats.size.toLocaleString()} keywords\n`);
    } catch (error) {
        console.error('❌ Failed to initialize cache:', error);
        throw error;
    }

    // Step 3: Verify
    console.log('🔍 Verification:');
    const indexCheck = await db.execute(`
        SELECT name, sql FROM sqlite_master 
        WHERE type='index' AND tbl_name='keywords' AND name='idx_keywords_keyword'
    `);
    console.log('  - UNIQUE INDEX:', indexCheck.rows.length > 0 ? '✓' : '✗');
    console.log('  - Cache Status:', keywordCache.getStats().initialized ? '✓' : '✗');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Setup Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📊 Expected Performance:');
    console.log('  - Row Reads per batch: 0 (was: thousands)');
    console.log('  - Row Writes per batch: actual unique keywords only');
    console.log('  - Memory usage: ~8-20MB for cache');
}

setup().catch(console.error);
