
'use client';

import { useState } from 'react';
import KeywordList from '@/components/KeywordList';
import { Database } from 'lucide-react';

export default function DataPage() {
    const [sort, setSort] = useState('search_desc');

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
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => setSort('search_desc')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${sort === 'search_desc' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50'}`}
                        >
                            전체 조회 (검색량순)
                        </button>
                    </div>



                    <KeywordList sort={sort} />
                </div>
            </div>
        </main>
    );
}
