'use client';

import { useState, useEffect } from 'react';
import { Activity, Database, Server, Key, RefreshCcw } from 'lucide-react';

export default function MonitoringStatus() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/monitor/stats');
            const data = await res.json();
            setStats(data);
        } catch (e) {
            console.error('Failed to fetch stats');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchStats();
        }
    }, [open]);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 rounded-md"
            >
                <Activity className="w-4 h-4" />
                <span>모니터링</span>
            </button>

            {open && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-20 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <Server className="w-4 h-4 text-emerald-500" />
                                시스템 상태
                            </h3>
                            <button
                                onClick={fetchStats}
                                className={`p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors ${loading ? 'animate-spin' : ''}`}
                            >
                                <RefreshCcw className="w-3.5 h-3.5 text-zinc-500" />
                            </button>
                        </div>

                        {!stats ? (
                            <div className="py-8 text-center text-xs text-zinc-500">
                                데이터 로딩중...
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-zinc-500 flex items-center gap-2">
                                        <Database className="w-3.5 h-3.5" /> 총 키워드
                                    </span>
                                    <span className="font-mono font-bold">{stats.total_keywords?.toLocaleString()} 개</span>
                                </div>

                                <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-zinc-500">대기중 (문서수)</span>
                                    <span className={`font-mono font-bold ${stats.pending_docs > 0 ? 'text-orange-500' : 'text-zinc-400'}`}>
                                        {stats.pending_docs?.toLocaleString()}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-zinc-500">확장 대기 (Seed)</span>
                                    <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                                        {stats.pending_seeds?.toLocaleString()}
                                    </span>
                                </div>

                                <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-zinc-500 flex items-center gap-2">
                                        <Key className="w-3.5 h-3.5" /> API 키
                                    </span>
                                    <span className="font-mono font-bold text-emerald-600">
                                        {stats.api_key_count} EA
                                    </span>
                                </div>

                                <div className="text-xs text-right text-zinc-400 mt-2">
                                    Update: {stats.last_activity ? new Date(stats.last_activity).toLocaleTimeString() : '-'}
                                </div>

                                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                    <div className="text-xs flex items-center justify-between">
                                        <span className="text-zinc-500">System Status</span>
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                                            {stats.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
