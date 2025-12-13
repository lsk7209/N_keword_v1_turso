'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// Fetcher function
const fetchKeywords = async ({ pageParam = 0, sort = 'search_desc' }) => {
    const res = await fetch(`/api/keywords?cursor=${pageParam}&limit=50&sort=${sort}`);
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

export default function KeywordList({ sort }: { sort: string }) {
    const parentRef = useRef<HTMLDivElement>(null);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        status
    } = useInfiniteQuery({
        queryKey: ['keywords', sort],
        queryFn: ({ pageParam }) => fetchKeywords({ pageParam, sort }),
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        initialPageParam: 0,
    });

    const allRows = data ? data.pages.flatMap((d) => d.data) : [];

    const rowVirtualizer = useVirtualizer({
        count: hasNextPage ? allRows.length + 1 : allRows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 48, // slightly smaller row height
        overscan: 5,
    });

    useEffect(() => {
        const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();
        if (!lastItem) return;

        if (
            lastItem.index >= allRows.length - 1 &&
            hasNextPage &&
            !isFetchingNextPage
        ) {
            fetchNextPage();
        }
    }, [
        hasNextPage,
        fetchNextPage,
        allRows.length,
        isFetchingNextPage,
        rowVirtualizer.getVirtualItems(),
    ]);

    if (status === 'pending') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
    if (status === 'error') return <div className="p-10 text-red-500">데이터를 불러오는 중 오류가 발생했습니다</div>;

    // Fixed widths for columns
    const colWidths = {
        keyword: 'min-w-[180px] md:min-w-[220px]',
        search: 'min-w-[80px]',
        click: 'min-w-[80px]',
        ctr: 'min-w-[70px]',
        comp: 'min-w-[70px]',
        doc: 'min-w-[60px]',
        ratio: 'min-w-[70px]',
        tier: 'min-w-[90px]',
    };

    const HeaderCell = ({ label, width, align = 'right' }: any) => (
        <div className={`${width} px-2 py-3 text-${align} font-semibold text-zinc-500 uppercase tracking-wider`}>
            {label}
        </div>
    );

    const DataCell = ({ value, width, align = 'right', className = '', title = '' }: any) => (
        <div className={`${width} px-2 py-2 text-${align} tabular-nums text-zinc-600 dark:text-zinc-400 truncate ${className}`} title={title}>
            {value}
        </div>
    );

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col h-[calc(100vh-200px)]">
            {/* Scrollable Container for both Header and List */}
            <div className="flex-1 overflow-auto" ref={parentRef}>
                <div className="min-w-[1600px]"> {/* Force horizontal availability */}
                    {/* Header */}
                    <div className="flex items-center bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 text-[10px] sm:text-xs sticky top-0 z-20">
                        <HeaderCell label="키워드" width={colWidths.keyword} align="left" />
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

                    {/* Virtual List */}
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            position: 'relative',
                        }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const isLoaderRow = virtualRow.index > allRows.length - 1;
                            const post = allRows[virtualRow.index];

                            return (
                                <div
                                    key={virtualRow.index}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                    className="flex items-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 text-xs sm:text-sm"
                                >
                                    {isLoaderRow ? (
                                        <div className="w-full flex justify-center text-sm text-gray-500 py-2">더 불러오는 중...</div>
                                    ) : (
                                        <>
                                            <DataCell value={post.keyword} width={colWidths.keyword} align="left" className="font-medium text-zinc-900 dark:text-zinc-100" title={post.keyword} />
                                            <DataCell value={post.blog_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                            <DataCell value={post.cafe_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                            <DataCell value={post.web_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                            <DataCell value={post.news_doc_cnt?.toLocaleString()} width={colWidths.doc} />
                                            <DataCell value={post.golden_ratio?.toFixed(2)} width={colWidths.ratio} className="font-semibold text-emerald-600" />
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
                                            <DataCell value={`${post.pc_ctr?.toFixed(2)}%`} width={colWidths.ctr} />
                                            <DataCell value={`${post.mo_ctr?.toFixed(2)}%`} width={colWidths.ctr} />
                                            <DataCell value={post.pl_avg_depth} width={colWidths.comp} title="평균 광고 노출 수" />
                                            <DataCell value={post.comp_idx} width={colWidths.comp} title="광고 경쟁 정도" />
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
