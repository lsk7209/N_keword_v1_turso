'use client';

import { useState } from 'react';
import { Loader2, Pickaxe, Search, CheckCircle2 } from 'lucide-react';
import { manualMining } from '@/app/actions';

export default function ManualMiner() {
    // 인터페이스 정의
    interface KeywordItem {
        keyword: string;
        pc_search_cnt: number;
        mo_search_cnt: number;
        total_search_cnt: number;
    }

    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<KeywordItem[]>([]);
    const [error, setError] = useState('');
    const [saveStats, setSaveStats] = useState<{ processed: number; saved: number } | null>(null);

    const handleMining = async () => {
        if (!input.trim()) return;

        setLoading(true);
        setError('');
        setResults([]);

        try {
            const keywords = input.split(',').map(s => s.trim()).filter(Boolean);
            if (keywords.length === 0) {
                setError('키워드를 입력해주세요.');
                return;
            }

            const response = await manualMining(keywords);

            if (!response.success) {
                throw new Error(response.error || '수집 중 오류 발생');
            }

            // Flatten results - 타입 가드 추가
            if (!response.results || !Array.isArray(response.results)) {
                setError('결과 데이터가 없습니다.');
                return;
            }

            const allItems = response.results
                .filter((r: any) => r.success)
                .flatMap((r: any) => r.data || []);

            // 실제 저장된(신규) 개수와 전체 수집된 개수 계산
            const totalInserted = response.results
                .filter((r: any) => r.success)
                .reduce((sum: number, r: any) => sum + (r.stats?.inserted || 0), 0);
            const totalProcessed = response.results
                .filter((r: any) => r.success)
                .reduce((sum: number, r: any) => sum + (r.stats?.processed || 0), 0);

            setSaveStats({ processed: totalProcessed, saved: totalInserted });
            setResults(allItems);

            if (allItems.length === 0) {
                // Check for errors
                const failures = response.results.filter((r: any) => !r.success);
                if (failures.length > 0) {
                    setError(`수집 실패: ${failures[0].error}`);
                } else {
                    setError('결과가 없습니다.');
                }
            } else if (totalInserted === 0 && totalProcessed > 0) {
                // 수집은 되었지만 저장되지 않은 경우 (모두 중복)
                setError(`수집 완료: ${totalProcessed}개 수집되었으나 모두 중복 키워드로 저장되지 않았습니다.`);
            }

        } catch (err: any) {
            console.error('[ManualMiner] Error:', err);
            const errorMessage = err.message || '수집 중 오류 발생';
            setError(errorMessage);
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
                        <span className="text-sm text-zinc-500 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            {saveStats ? (
                                saveStats.saved > 0 ? (
                                    `DB 저장 완료 (신규 ${saveStats.saved}개 추가, ${saveStats.processed - saveStats.saved}개 중복 제외)`
                                ) : (
                                    `수집 완료 (${saveStats.processed}개 모두 이미 DB에 존재함)`
                                )
                            ) : (
                                'DB 저장 완료'
                            )}
                        </span>
                    </div>

                    <div className="max-h-96 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">연관 키워드</th>
                                        <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">PC 검색량</th>
                                        <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Mobile 검색량</th>
                                        <th className="px-4 py-3 font-medium text-right">총 검색량</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                                    {results.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                                            <td className="px-4 py-2 font-medium">{item.keyword}</td>
                                            <td className="px-4 py-2 text-right text-zinc-500 hidden sm:table-cell">{item.pc_search_cnt.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right text-zinc-500 hidden sm:table-cell">{item.mo_search_cnt.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right font-bold text-zinc-900 dark:text-zinc-100">{item.total_search_cnt.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
