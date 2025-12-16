'use client';

import { useQuery } from '@tanstack/react-query';
import { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// Fetcher function
const fetchKeywords = async ({ cursor = 0, limit = 100, sort = 'search_desc' }: { cursor: number; limit: number; sort: string }) => {
    const res = await fetch(`/api/keywords?cursor=${cursor}&limit=${limit}&sort=${sort}`);
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
    page,
    pageSize,
    onPageChange
}: {
    sort: string;
    page: number;
    pageSize: number;
    onPageChange: (nextPage: number) => void;
}) {
    const parentRef = useRef<HTMLDivElement>(null);

    const {
        data,
        status,
        isFetching
    } = useQuery({
        queryKey: ['keywords', sort, page, pageSize],
        queryFn: () => fetchKeywords({ cursor: (page - 1) * pageSize, limit: pageSize, sort }),
        staleTime: 30_000,
    });

    const rows: Keyword[] = data?.data || [];
    const total: number = typeof data?.total === 'number' ? data.total : 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    useEffect(() => {
        // When page changes, scroll back to top of list for better UX.
        parentRef.current?.scrollTo({ top: 0 });
    }, [page, sort]);

    if (status === 'pending') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
    if (status === 'error') return <div className="p-10 text-red-500">데이터를 불러오는 중 오류가 발생했습니다</div>;

    // Fixed widths for columns - using fixed widths for strict alignment
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
        <div className={`${width} shrink-0 px-2 py-3 text-${align} font-semibold text-zinc-500 uppercase tracking-wider`}>
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
        <div className={`${width} shrink-0 px-2 py-2 text-${align} tabular-nums text-zinc-600 dark:text-zinc-400 truncate ${className}`} title={title}>
            {value}
        </div>
    );

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col h-[calc(100vh-200px)]">
            {/* Pagination */}
            <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    페이지당 <span className="font-semibold text-zinc-700 dark:text-zinc-200">{pageSize}</span>개 · 총{' '}
                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">{total.toLocaleString()}</span>개
                    {isFetching ? <span className="ml-2">불러오는 중...</span> : null}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onPageChange(Math.max(1, page - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 disabled:opacity-50"
                    >
                        이전
                    </button>
                    <div className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                        {page.toLocaleString()} / {totalPages.toLocaleString()}
                    </div>
                    <button
                        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                        className="px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 disabled:opacity-50"
                    >
                        다음
                    </button>
                </div>
            </div>

            {/* Scrollable Container for both Header and List */}
            <div className="flex-1 overflow-auto" ref={parentRef}>
                <div className="min-w-max"> {/* Force horizontal availability to fit all fixed columns */}
                    {/* Header */}
                    <div className="flex items-center bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 text-[10px] sm:text-xs sticky top-0 z-20">
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
                        {rows.length === 0 ? (
                            <div className="p-10 text-sm text-zinc-500 dark:text-zinc-400">표시할 데이터가 없습니다.</div>
                        ) : (
                            rows.map((post) => (
                                <div
                                    key={post.id || post.keyword}
                                    className="flex items-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 text-xs sm:text-sm"
                                >
                                    <DataCell value={post.keyword} width={colWidths.keyword} align="left" className="font-medium text-zinc-900 dark:text-zinc-100" title={post.keyword} />
                                    <DataCell value={post.total_search_cnt?.toLocaleString()} width={colWidths.search} />
                                    <DataCell value={post.blog_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                    <DataCell value={post.cafe_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                    <DataCell value={post.web_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                    <DataCell value={post.news_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                    <DataCell value={typeof post.golden_ratio === 'number' ? post.golden_ratio.toFixed(2) : ''} width={colWidths.ratio} className="font-semibold text-emerald-600" />
                                    <div className={`${colWidths.tier} flex justify-center`}>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold 
                                            ${post.tier === 'PLATINUM' ? 'bg-cyan-100 text-cyan-700' :
                                                post.tier === 'GOLD' ? 'bg-yellow-100 text-yellow-700' :
                                                    post.tier === 'SILVER' ? 'bg-slate-100 text-slate-700' :
                                                        'bg-orange-50 text-orange-800'}`}>
                                            {post.tier}
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
        </div>
    );
}
