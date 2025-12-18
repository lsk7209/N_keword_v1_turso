'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';

// Fetcher function - page-based pagination
const fetchKeywords = async ({ page = 1, limit = 100, sort = 'search_desc' }: { page: number; limit: number; sort: string }) => {
    const res = await fetch(`/api/keywords?page=${page}&limit=${limit}&sort=${sort}`);
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
};

interface Keyword {
    id: string;
    keyword: string;
    total_search_cnt: number;
    total_doc_cnt: number;
    golden_ratio: number;
    tier: string;
    pc_search_cnt: number;
    mo_search_cnt: number;
    pc_click_cnt: number;
    mo_click_cnt: number;
    pc_ctr: number;
    mo_ctr: number;
    comp_idx: string;
    pl_avg_depth: number;
    blog_doc_cnt: number;
    cafe_doc_cnt: number;
    web_doc_cnt: number;
    news_doc_cnt: number;
}

export default function KeywordList({
    sort,
}: {
    sort: string;
}) {
    const [keywords, setKeywords] = useState<Keyword[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const parentRef = useRef<HTMLDivElement>(null);
    const pageSize = 100;

    // Initial load
    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const result = await fetchKeywords({ page: 1, limit: pageSize, sort });
                setKeywords(result.data || []);
                setTotal(result.total || 0);
                setHasMore(result.data && result.data.length === pageSize);
                setCurrentPage(1);
            } catch (err: any) {
                setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다');
            } finally {
                setIsLoading(false);
            }
        };

        loadInitialData();
    }, [sort]);

    // Load more function
    const loadMore = async () => {
        if (isLoadingMore || !hasMore) return;

        setIsLoadingMore(true);
        try {
            const nextPage = currentPage + 1;
            const result = await fetchKeywords({ page: nextPage, limit: pageSize, sort });
            
            if (result.data && result.data.length > 0) {
                setKeywords(prev => [...prev, ...result.data]);
                setCurrentPage(nextPage);
                setHasMore(result.data.length === pageSize);
            } else {
                setHasMore(false);
            }
        } catch (err: any) {
            setError(err.message || '추가 데이터를 불러오는 중 오류가 발생했습니다');
        } finally {
            setIsLoadingMore(false);
        }
    };

    // Fixed widths for columns
    const colWidths = {
        keyword: 'w-[200px] md:w-[240px]',
        search: 'w-[110px]',
        click: 'w-[90px]',
        ctr: 'w-[80px]',
        comp: 'w-[80px]',
        doc: 'w-[95px]',
        ratio: 'w-[80px]',
        tier: 'w-[100px]',
    };

    const HeaderCell = ({ label, width, align = 'right' }: { label: string; width: string; align?: 'left' | 'center' | 'right' }) => (
        <div className={`${width} shrink-0 px-2 py-3 text-${align} font-semibold text-zinc-500 uppercase tracking-wider text-xs sm:text-sm`}>
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

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center justify-center h-[calc(100vh-200px)]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
                    <p className="text-sm text-zinc-500">데이터를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 p-10 text-center">
                <p className="text-red-500 text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col h-[calc(100vh-200px)]">
            {/* Header Info */}
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                    표시 중: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{keywords.length.toLocaleString()}</span>개 / 
                    총 <span className="font-semibold text-zinc-700 dark:text-zinc-200">{total.toLocaleString()}</span>개
                </div>
                {isLoadingMore && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <Loader2 className="animate-spin w-4 h-4" />
                        <span>추가 데이터 불러오는 중...</span>
                    </div>
                )}
            </div>

            {/* Scrollable Container */}
            <div className="flex-1 overflow-auto" ref={parentRef}>
                <div className="min-w-max">
                    {/* Header */}
                    <div className="flex items-center bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 z-20">
                        <HeaderCell label="키워드" width={colWidths.keyword} align="left" />
                        <HeaderCell label="총검색량" width={colWidths.search} />
                        <HeaderCell label="블로그" width={colWidths.doc} />
                        <HeaderCell label="카페" width={colWidths.doc} />
                        <HeaderCell label="웹" width={colWidths.doc} />
                        <HeaderCell label="뉴스" width={colWidths.doc} />
                        <HeaderCell label="비율" width={colWidths.ratio} />
                        <HeaderCell label="등급" width={colWidths.tier} align="center" />
                        <HeaderCell label="PC 검색" width={colWidths.search} />
                        <HeaderCell label="MO 검색" width={colWidths.search} />
                        <HeaderCell label="PC 클릭" width={colWidths.click} />
                        <HeaderCell label="MO 클릭" width={colWidths.click} />
                        <HeaderCell label="PC CTR" width={colWidths.ctr} />
                        <HeaderCell label="MO CTR" width={colWidths.ctr} />
                        <HeaderCell label="광고수" width={colWidths.comp} />
                        <HeaderCell label="경쟁" width={colWidths.comp} />
                    </div>

                    {/* List */}
                    <div>
                        {keywords.length === 0 ? (
                            <div className="p-10 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                                표시할 데이터가 없습니다.
                            </div>
                        ) : (
                            keywords.map((post) => (
                                <div
                                    key={post.id || post.keyword}
                                    className="flex items-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800"
                                >
                                    <DataCell 
                                        value={post.keyword} 
                                        width={colWidths.keyword} 
                                        align="left" 
                                        className="font-medium text-zinc-900 dark:text-zinc-100" 
                                        title={post.keyword} 
                                    />
                                    <DataCell value={post.total_search_cnt?.toLocaleString()} width={colWidths.search} />
                                    <DataCell value={post.blog_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                    <DataCell value={post.cafe_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                    <DataCell value={post.web_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                    <DataCell value={post.news_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                    <DataCell 
                                        value={typeof post.golden_ratio === 'number' ? post.golden_ratio.toFixed(2) : ''} 
                                        width={colWidths.ratio} 
                                        className="font-semibold text-emerald-600" 
                                    />
                                    <div className={`${colWidths.tier} flex justify-center`}>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold 
                                            ${post.tier === 'PLATINUM' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' :
                                                post.tier === 'GOLD' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                                                    post.tier === 'SILVER' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                                                        post.tier === 'ERROR' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                                                            'bg-orange-50 text-orange-800 dark:bg-orange-900 dark:text-orange-300'}`}>
                                            {post.tier || 'UNRANKED'}
                                        </span>
                                    </div>
                                    <DataCell value={post.pc_search_cnt?.toLocaleString()} width={colWidths.search} />
                                    <DataCell value={post.mo_search_cnt?.toLocaleString()} width={colWidths.search} />
                                    <DataCell value={post.pc_click_cnt?.toLocaleString()} width={colWidths.click} />
                                    <DataCell value={post.mo_click_cnt?.toLocaleString()} width={colWidths.click} />
                                    <DataCell value={typeof post.pc_ctr === 'number' ? `${post.pc_ctr.toFixed(2)}%` : ''} width={colWidths.ctr} />
                                    <DataCell value={typeof post.mo_ctr === 'number' ? `${post.mo_ctr.toFixed(2)}%` : ''} width={colWidths.ctr} />
                                    <DataCell value={post.pl_avg_depth} width={colWidths.comp} title="평균 광고 노출 수" />
                                    <DataCell value={post.comp_idx} width={colWidths.comp} title="광고 경쟁 정도" />
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Load More Button */}
            {hasMore && (
                <div className="px-4 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-center">
                    <button
                        onClick={loadMore}
                        disabled={isLoadingMore}
                        className="px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm hover:shadow-md"
                    >
                        {isLoadingMore ? (
                            <>
                                <Loader2 className="animate-spin w-4 h-4" />
                                <span>불러오는 중...</span>
                            </>
                        ) : (
                            <>
                                <ChevronDown className="w-4 h-4" />
                                <span>100개 더 보기</span>
                            </>
                        )}
                    </button>
                </div>
            )}

            {!hasMore && keywords.length > 0 && (
                <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 text-center">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        모든 데이터를 불러왔습니다. ({keywords.length.toLocaleString()}개)
                    </p>
                </div>
            )}
        </div>
    );
}
