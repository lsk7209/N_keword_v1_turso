'use client';

import { useState } from 'react';
import KeywordList from '@/components/KeywordList';
import { LayoutDashboard, TrendingUp } from 'lucide-react';

export default function InsightPage() {
    const [sort, setSort] = useState('search_desc');

    return (
        <main className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <LayoutDashboard className="w-8 h-8 text-primary" />
                            네이버 황금키워드 채굴기
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                            100만+ 데이터 기반 실시간 키워드 분석 대시보드
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setSort('search_desc')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${sort === 'search_desc' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50'}`}
                        >
                            높은 검색량순
                        </button>
                        <button
                            onClick={() => setSort('opp_desc')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${sort === 'opp_desc' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50'}`}
                        >
                            <TrendingUp className="w-4 h-4 inline mr-1" />
                            황금비율순
                        </button>
                    </div>
                </header>

                {/* Stats Summary (Placeholder) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {['전체 키워드', '황금비율 > 5', '오늘 수집됨', 'API 상태'].map((label, i) => (
                        <div key={i} className="bg-white dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
                            <div className="text-sm text-zinc-500">{label}</div>
                            <div className="text-2xl font-bold mt-1 max-w-full truncate">
                                {i === 3 ? '정상 작동중' : (1000 * (i + 1)).toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main List */}
                <div className="space-y-4">
                    <div className="grid grid-cols-12 gap-4 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        <div className="col-span-4">키워드</div>
                        <div className="col-span-2 text-right">검색량</div>
                        <div className="col-span-2 text-right">문서수</div>
                        <div className="col-span-2 text-right">비율</div>
                        <div className="col-span-2 text-right">등급</div>
                    </div>

                    <KeywordList sort={sort} />
                </div>
            </div>
        </main>
    );
}
