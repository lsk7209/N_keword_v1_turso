'use client';

import { useState } from 'react';
import { Loader2, Search, Database, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface KeywordData {
    id: string;
    keyword: string;
    total_search_cnt: number;
    pc_search_cnt: number;
    mo_search_cnt: number;
    click_cnt: number;
    pc_click_cnt: number;
    mo_click_cnt: number;
    total_ctr: number;
    pc_ctr: number;
    mo_ctr: number;
    comp_idx: string;
    pl_avg_depth: number;
    total_doc_cnt: number;
    blog_doc_cnt: number;
    cafe_doc_cnt: number;
    web_doc_cnt: number;
    news_doc_cnt: number;
    tier: string;
    golden_ratio: number;
}

export default function BulkPage() {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<KeywordData[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleInquire = async () => {
        if (!input.trim()) {
            toast.error('키워드를 입력해주세요.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResults([]);

        const keywords = input.split('\n').map(k => k.trim()).filter(k => k);

        if (keywords.length === 0) {
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/keywords/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keywords }),
            });

            if (!res.ok) {
                throw new Error('데이터를 불러오는데 실패했습니다.');
            }

            const data = await res.json();
            if (data.error) {
                throw new Error(data.error);
            }

            setResults(data.data || []);
            toast.success(`${data.data?.length || 0}개의 키워드 정보를 가져왔습니다.`);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            toast.error(err.message || '오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    // Table Column Widths (matching KeywordList)
    const colWidths = {
        keyword: 'w-[180px] md:w-[220px]',
        search: 'w-[100px]',
        click: 'w-[90px]',
        ctr: 'w-[80px]',
        comp: 'w-[80px]',
        doc: 'w-[95px]',
        ratio: 'w-[80px]',
        tier: 'w-[90px]',
    };

    const HeaderCell = ({ label, width, align = 'right', className = '' }: { label: string; width: string; align?: 'left' | 'center' | 'right'; className?: string }) => (
        <div className={`${width} shrink-0 px-2 py-3 text-${align} font-semibold text-zinc-500 uppercase tracking-wider text-xs sm:text-sm bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 ${className}`}>
            {label}
        </div>
    );

    const DataCell = ({
        value,
        width,
        align = 'right',
        className = '',
        title = ''
    }: {
        value: React.ReactNode;
        width: string;
        align?: 'left' | 'center' | 'right';
        className?: string;
        title?: string;
    }) => (
        <div className={`${width} shrink-0 px-2 py-2 text-${align} tabular-nums text-zinc-600 dark:text-zinc-400 truncate text-xs sm:text-sm ${className}`} title={title}>
            {value}
        </div>
    );

    return (
        <main className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <header>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Database className="w-8 h-8 text-green-600" />
                        대량 키워드 조회
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                        여러 키워드를 한 번에 입력하여 데이터를 조회하고 수집합니다. (줄바꿈으로 구분)
                    </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Input Section */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 p-4">
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                키워드 입력
                            </label>
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={`키워드1\n키워드2\n키워드3`}
                                className="w-full h-[500px] p-3 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none font-mono"
                            />
                            <div className="mt-4">
                                <button
                                    onClick={handleInquire}
                                    disabled={isLoading || !input.trim()}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            처리 중...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-4 h-4" />
                                            조회하기
                                        </>
                                    )}
                                </button>
                                <p className="text-xs text-zinc-400 mt-2 text-center">
                                    * 신규 키워드는 조회 시 자동 수집됩니다.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Results Section */}
                    <div className="lg:col-span-3">
                        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col h-[600px] lg:h-full min-h-[600px]">
                            {/* Result Header */}
                            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                                <h2 className="text-sm font-semibold flex items-center gap-2">
                                    조회 결과 <span className="text-zinc-500 font-normal">({results.length}개)</span>
                                </h2>
                            </div>

                            {/* Content */}
                            {results.length > 0 ? (
                                <div className="flex-1 overflow-auto">
                                    <div className="min-w-max">
                                        <div className="flex items-center bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 z-20">
                                            <HeaderCell label="키워드" width={colWidths.keyword} align="left" className="sticky left-0 z-30 shadow-[1px_0_0_0_rgba(0,0,0,0.1)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.1)]" />
                                            <HeaderCell label="등급" width={colWidths.tier} align="center" />
                                            <HeaderCell label="총검색량" width={colWidths.search} />
                                            <HeaderCell label="비율" width={colWidths.ratio} />
                                            <HeaderCell label="블로그" width={colWidths.doc} />
                                            <HeaderCell label="카페" width={colWidths.doc} />
                                            <HeaderCell label="웹" width={colWidths.doc} />
                                            <HeaderCell label="뉴스" width={colWidths.doc} />
                                            <HeaderCell label="PC 검색" width={colWidths.search} />
                                            <HeaderCell label="MO 검색" width={colWidths.search} />
                                            <HeaderCell label="광고수" width={colWidths.comp} />
                                        </div>
                                        <div>
                                            {results.map((item) => (
                                                <div
                                                    key={item.id || item.keyword}
                                                    className="flex items-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800"
                                                >
                                                    <DataCell
                                                        value={item.keyword}
                                                        width={colWidths.keyword}
                                                        align="left"
                                                        className="font-bold text-zinc-900 dark:text-zinc-100 sticky left-0 bg-white dark:bg-zinc-900 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.1)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.1)]"
                                                        title={item.keyword}
                                                    />
                                                    <div className={`${colWidths.tier} flex justify-center shrink-0`}>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold 
                                                            ${item.tier === 'PLATINUM' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300 ring-1 ring-cyan-200 dark:ring-cyan-800' :
                                                                item.tier === 'GOLD' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 ring-1 ring-yellow-200 dark:ring-yellow-800' :
                                                                    item.tier === 'SILVER' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700' :
                                                                        item.tier === 'ERROR' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                                                                            'bg-orange-50 text-orange-800 dark:bg-orange-900 dark:text-orange-300'}`}>
                                                            {item.tier || 'UNRANKED'}
                                                        </span>
                                                    </div>
                                                    <DataCell value={item.total_search_cnt?.toLocaleString()} width={colWidths.search} />
                                                    <DataCell
                                                        value={typeof item.golden_ratio === 'number' ? item.golden_ratio.toFixed(2) : ''}
                                                        width={colWidths.ratio}
                                                        className="font-semibold text-emerald-600"
                                                    />
                                                    <DataCell value={item.blog_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                                    <DataCell value={item.cafe_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                                    <DataCell value={item.web_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                                    <DataCell value={item.news_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                                    <DataCell value={item.pc_search_cnt?.toLocaleString()} width={colWidths.search} />
                                                    <DataCell value={item.mo_search_cnt?.toLocaleString()} width={colWidths.search} />
                                                    <DataCell value={item.comp_idx} width={colWidths.comp} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-4">
                                    {isLoading ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                                            <p className="text-sm">데이터를 조회하고 있습니다...</p>
                                        </div>
                                    ) : error ? (
                                        <div className="flex flex-col items-center gap-2 text-red-500">
                                            <AlertCircle className="w-8 h-8" />
                                            <p>{error}</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <Database className="w-12 h-12 text-zinc-200 dark:text-zinc-800" />
                                            <p>왼쪽에서 키워드를 입력하고 조회해주세요.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
