'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, Database, AlertCircle, Download, Clock, CheckCircle2 } from 'lucide-react';
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

type QueueStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';

export default function BulkPage() {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<KeywordData[]>([]);
    const [error, setError] = useState<string | null>(null);

    // 큐 상태 관리
    const [queueId, setQueueId] = useState<string | null>(null);
    const [queueStatus, setQueueStatus] = useState<QueueStatus>('idle');
    const [processedSeeds, setProcessedSeeds] = useState(0);
    const [totalSeeds, setTotalSeeds] = useState(0);

    // 폴링으로 큐 상태 확인
    const pollQueueStatus = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/keywords/bulk?id=${id}`);
            const data = await res.json();

            if (data.error) {
                setError(data.error);
                setQueueStatus('failed');
                return;
            }

            setQueueStatus(data.status as QueueStatus);
            setProcessedSeeds(data.processedSeeds || 0);
            setTotalSeeds(data.totalSeeds || 0);

            if (data.status === 'completed') {
                setResults(data.data || []);
                toast.success(`✅ 수집 완료! ${data.resultCount || 0}개의 키워드를 찾았습니다.`);
                setIsLoading(false);
                setQueueId(null);
            } else if (data.status === 'failed') {
                setError(data.error || '수집 중 오류가 발생했습니다.');
                setIsLoading(false);
                setQueueId(null);
            }
            // pending 또는 processing인 경우 계속 폴링
        } catch (err: any) {
            console.error('Polling error:', err);
        }
    }, []);

    // 폴링 스케줄러
    useEffect(() => {
        if (!queueId || queueStatus === 'completed' || queueStatus === 'failed') {
            return;
        }

        const interval = setInterval(() => {
            pollQueueStatus(queueId);
        }, 5000); // 5초마다 폴링

        return () => clearInterval(interval);
    }, [queueId, queueStatus, pollQueueStatus]);

    const handleInquire = async () => {
        if (!input.trim()) {
            toast.error('키워드를 입력해주세요.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResults([]);
        setQueueStatus('idle');

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

            const data = await res.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // 큐 등록 성공
            setQueueId(data.queueId);
            setQueueStatus('queued');
            setTotalSeeds(keywords.length);
            toast.info(`📋 ${keywords.length}개 키워드가 수집 대기열에 추가되었습니다.`);

            // 즉시 첫 폴링 시작
            pollQueueStatus(data.queueId);

        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            toast.error(err.message || '오류가 발생했습니다.');
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

    const downloadCSV = () => {
        if (results.length === 0) {
            toast.error('다운로드할 데이터가 없습니다.');
            return;
        }

        const headers = ['키워드', '등급', '총검색량', '황금비율', '총 문서수', '블로그', '카페', '웹', '뉴스', 'PC 검색수', 'MO 검색수', '경쟁정도'];
        const csvContent = [
            headers.join(','),
            ...results.map(row => [
                row.keyword,
                row.tier,
                row.total_search_cnt,
                row.golden_ratio?.toFixed(2),
                row.total_doc_cnt,
                row.blog_doc_cnt,
                row.cafe_doc_cnt,
                row.web_doc_cnt,
                row.news_doc_cnt,
                row.pc_search_cnt,
                row.mo_search_cnt,
                row.comp_idx
            ].map(cell => `"${cell || 0}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `keywords_bulk_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 상태 표시 렌더링
    const renderStatus = () => {
        if (queueStatus === 'queued') {
            return (
                <div className="flex items-center gap-2 text-amber-500">
                    <Clock className="w-5 h-5 animate-pulse" />
                    <span>대기 중... 곧 백그라운드에서 수집이 시작됩니다.</span>
                </div>
            );
        }
        if (queueStatus === 'processing') {
            return (
                <div className="flex items-center gap-2 text-blue-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>수집 중... ({processedSeeds}/{totalSeeds} 시드 처리됨)</span>
                </div>
            );
        }
        if (queueStatus === 'completed') {
            return (
                <div className="flex items-center gap-2 text-green-500">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>수집 완료!</span>
                </div>
            );
        }
        return null;
    };

    return (
        <main className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Database className="w-8 h-8 text-green-600" />
                            대량 키워드 조회
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                            여러 키워드를 한 번에 입력하여 데이터를 조회하고 수집합니다. (줄바꿈으로 구분)
                        </p>
                    </div>
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
                                disabled={isLoading}
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
                                    * 백그라운드에서 완전 수집됩니다 (최대 15분 소요).
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
                                <div className="flex items-center gap-3">
                                    {renderStatus()}
                                    {results.length > 0 && (
                                        <button
                                            onClick={downloadCSV}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            CSV 다운로드
                                        </button>
                                    )}
                                </div>
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
                                            <HeaderCell label="총 문서" width={colWidths.doc} />
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
                                                    <DataCell value={item.total_doc_cnt?.toLocaleString()} width={colWidths.doc} />
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
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="w-10 h-10 animate-spin text-green-600" />
                                            <div className="text-center">
                                                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                                                    {queueStatus === 'queued' && '수집 대기열에 추가됨...'}
                                                    {queueStatus === 'processing' && `수집 중... (${processedSeeds}/${totalSeeds})`}
                                                </p>
                                                <p className="text-xs text-zinc-400 mt-1">
                                                    백그라운드에서 완전 수집됩니다. 이 페이지를 닫아도 됩니다.
                                                </p>
                                            </div>
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
