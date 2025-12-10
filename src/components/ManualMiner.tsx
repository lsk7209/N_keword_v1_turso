
'use client';

import { useState } from 'react';
import { Loader2, Pickaxe, Search, CheckCircle2 } from 'lucide-react';

export default function ManualMiner() {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [error, setError] = useState('');

    const handleMining = async () => {
        if (!input.trim()) return;

        setLoading(true);
        setError('');
        setResults([]);

        const keywords = input.split(',').map(k => k.trim()).filter(Boolean);
        if (keywords.length > 5) {
            setError('키워드는 최대 5개까지 입력 가능합니다.');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/miner/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keywords })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Mining failed');

            // Check if individual results have errors
            const failedResults = data.results.filter((r: any) => !r.success);
            if (failedResults.length > 0) {
                const firstError = failedResults[0].error;
                throw new Error(`Partial Failure: ${firstError}`);
            }

            const allItems = data.results.flatMap((r: any) => r.data || []);
            setResults(allItems);

        } catch (e: any) {
            console.error("Mining Error:", e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            <div className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="키워드 입력 (콤마로 구분, 예: 홍대맛집, 강남카페)"
                    className="flex-1 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleMining()}
                />
                <button
                    onClick={handleMining}
                    disabled={loading || !input.trim()}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg disabled:opacity-50 flex items-center gap-2 whitespace-nowrap transition-colors"
                >
                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Pickaxe className="w-5 h-5" />}
                    수집 시작
                </button>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-md text-sm text-left">
                    {error}
                </div>
            )}

            {results.length > 0 && (
                <div className="mt-8 space-y-4 text-left">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <Search className="w-5 h-5 text-emerald-600" />
                            수집된 연관 키워드 ({results.length}개)
                        </h3>
                        <span className="text-sm text-zinc-500 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            DB 저장 완료 (상세 분석 대기중)
                        </span>
                    </div>

                    <div className="max-h-96 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 font-medium">연관 키워드</th>
                                    <th className="px-4 py-3 font-medium text-right">PC 검색량</th>
                                    <th className="px-4 py-3 font-medium text-right">Mobile 검색량</th>
                                    <th className="px-4 py-3 font-medium text-right">총 검색량</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                                {results.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                                        <td className="px-4 py-2 font-medium">{item.keyword}</td>
                                        <td className="px-4 py-2 text-right text-zinc-500">{item.pc_search_cnt.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right text-zinc-500">{item.mo_search_cnt.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right font-bold text-zinc-900 dark:text-zinc-100">{item.total_search_cnt.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
