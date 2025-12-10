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
    blog_doc_cnt: number;
    cafe_doc_cnt: number;
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
        estimateSize: () => 60, // approximate row height
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

    return (
        <div
            ref={parentRef}
            className="h-[calc(100vh-200px)] overflow-auto bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800"
        >
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
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
                            className="flex items-center px-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800"
                        >
                            {isLoaderRow ? (
                                <div className="w-full flex justify-center text-sm text-gray-500 py-2">더 불러오는 중...</div>
                            ) : (
                                <div className="grid grid-cols-12 gap-4 w-full text-sm">
                                    <div className="col-span-4 font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                        {post.keyword}
                                    </div>
                                    <div className="col-span-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                                        {post.total_search_cnt.toLocaleString()}
                                    </div>
                                    <div className="col-span-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                                        {post.total_doc_cnt?.toLocaleString() || '-'}
                                    </div>
                                    <div className="col-span-2 text-right tabular-nums font-semibold text-emerald-600">
                                        {post.golden_ratio?.toFixed(2)}
                                    </div>
                                    <div className="col-span-2 flex justify-end">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold 
                        ${post.tier === 'PLATINUM' ? 'bg-cyan-100 text-cyan-700' :
                                                post.tier === 'GOLD' ? 'bg-yellow-100 text-yellow-700' :
                                                    post.tier === 'SILVER' ? 'bg-slate-100 text-slate-700' :
                                                        'bg-orange-50 text-orange-800'}`}>
                                            {post.tier}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
