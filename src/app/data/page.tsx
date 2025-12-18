
'use client';

import { useState } from 'react';
import KeywordList from '@/components/KeywordList';
import { Database } from 'lucide-react';

export default function DataPage() {
    const [sort, setSort] = useState('search_desc');
    const [isExportingAll, setIsExportingAll] = useState(false);

    const onChangeSort = (nextSort: string) => {
        setSort(nextSort);
    };

    const downloadExcelFirstPage = () => {
        const params = new URLSearchParams({
            page: '1',
            limit: '100',
            sort,
        });
        window.location.href = `/api/keywords/export?${params.toString()}`;
    };

    const downloadExcelAll = async () => {
        if (isExportingAll) return;
        setIsExportingAll(true);
        try {
            // Download in multiple CSV parts to avoid Vercel 60s / response size limits.
            const chunkSize = 5000;
            let cursor = 0;
            let part = 1;
            const maxParts = 500; // safety

            while (part <= maxParts) {
                const params = new URLSearchParams({
                    cursor: String(cursor),
                    limit: String(chunkSize),
                    sort,
                    part: String(part),
                });

                const res = await fetch(`/api/keywords/export?${params.toString()}`);
                if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);

                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `keywords_export_part${part}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);

                const nextCursorHeader = res.headers.get('X-Next-Cursor') || '';
                const nextCursor = nextCursorHeader ? Number(nextCursorHeader) : null;
                if (!nextCursor || !Number.isFinite(nextCursor)) break;

                cursor = nextCursor;
                part += 1;

                // small delay to keep the browser responsive and avoid request bursts
                await new Promise((r) => setTimeout(r, 250));
            }
        } finally {
            setIsExportingAll(false);
        }
    };

    return (
        <main className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Database className="w-8 h-8 text-blue-600" />
                            키워드 데이터베이스
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                            전체 수집된 키워드 목록을 조회하고 검색합니다.
                        </p>
                    </div>
                </header>

                {/* Main List */}
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2 justify-between items-center">
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={downloadExcelFirstPage}
                                className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-slate-700 text-white hover:bg-slate-800"
                            >
                                엑셀 내보내기 (1페이지 100개)
                            </button>
                            <button
                                onClick={downloadExcelAll}
                                disabled={isExportingAll}
                                className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isExportingAll ? '전체 내보내는 중...' : '엑셀 내보내기 (전체)'}
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-2 justify-end">
                        <button
                            onClick={() => onChangeSort('search_desc')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${sort === 'search_desc' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800'}`}
                        >
                            전체 조회 (검색량순)
                        </button>
                        <button
                            onClick={() => onChangeSort(sort === 'tier_desc' ? 'tier_asc' : 'tier_desc')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${sort === 'tier_desc' || sort === 'tier_asc' ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg' : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800'}`}
                        >
                            💎 등급순 {sort === 'tier_asc' ? '↑' : '↓'}
                        </button>
                        {[
                            { key: 'cafe_asc', label: '카페 적은순' },
                            { key: 'blog_asc', label: '블로그 적은순' },
                            { key: 'web_asc', label: '웹 적은순' },
                            { key: 'news_asc', label: '뉴스 적은순' },
                        ].map((item) => (
                            <button
                                key={item.key}
                                onClick={() => onChangeSort(item.key)}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${sort === item.key ? 'bg-emerald-600 text-white' : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800'}`}
                            >
                                {item.label}
                            </button>
                        ))}
                        </div>
                    </div>



                    <KeywordList sort={sort} />
                </div>
            </div>
        </main>
    );
}
