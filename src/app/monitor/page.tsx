
import { getTursoClient } from '@/utils/turso';
import { Activity, Database, Layers, Search, TrendingUp, AlertCircle, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { keyManager } from '@/utils/key-manager';
import MiningControls from '@/components/MiningControls';
import AutoRefresh from '@/components/AutoRefresh';

// Force dynamic to get latest stats
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Utility to get safe colors for tiers
const getTierColor = (tier: string) => {
    switch (tier) {
        case 'PLATINUM': return 'text-cyan-500 bg-cyan-100 dark:bg-cyan-900/30';
        case 'GOLD': return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30';
        case 'SILVER': return 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800'; // Silver looks better as subtle gray
        case 'BRONZE': return 'text-amber-700 bg-amber-100 dark:bg-amber-900/30';
        default: return 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800';
    }
};

interface StatCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    desc: string;
    progress?: number;
    color?: string;
}

interface TierBarProps {
    label: string;
    count: number;
    total: number;
    color: string;
}

export default async function MonitorPage() {
    let total = 0;
    let analyzed = 0;
    let expanded = 0;
    let platinumCount = 0;
    let goldCount = 0;
    let silverCount = 0;
    let bronzeCount = 0;
    let recentLogs: any[] = [];
    let errorMsg = '';
    const adKeyStatus = keyManager.getStatusSummary('AD');
    const searchKeyStatus = keyManager.getStatusSummary('SEARCH');
    let pendingDocs = 0;
    let newKeywords24h = 0;
    let docsFilled24h = 0;
    let seedKeywordsTotal = 0;
    let seedKeywordsPending = 0;
    let seedKeywordsExpanded = 0;
    let seedKeywordsProcessing = 0;
    let recentSeeds: any[] = [];

    try {
        const db = getTursoClient();
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 1. Fetch Stats in parallel
        const [
            totalResult,
            analyzedResult,
            expandedResult,
            platinumResult,
            goldResult,
            newKeywords24hResult,
            docsFilled24hResult,
            logsResult,
            seedTotalResult,
            seedPendingResult,
            seedExpandedResult,
            seedProcessingResult,
            recentSeedsResult,
            silverResult,
            bronzeResult
        ] = await Promise.all([
            db.execute('SELECT COUNT(*) as count FROM keywords'),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt >= 0'),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 1'),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE tier = ?', ['PLATINUM']),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE tier = ?', ['GOLD']),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE created_at >= ?', [since24h]),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt >= 0 AND updated_at >= ?', [since24h]),
            db.execute('SELECT * FROM keywords ORDER BY created_at DESC LIMIT 10'),
            // 시드키워드 현황 (검색량 100 이상인 키워드 - 수집 기준과 동일)
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE total_search_cnt >= 100'),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 100'),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 1 AND total_search_cnt >= 100'),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 2 AND total_search_cnt >= 100'),
            db.execute('SELECT keyword, total_search_cnt, is_expanded, updated_at FROM keywords WHERE total_search_cnt >= 100 ORDER BY total_search_cnt DESC LIMIT 20'),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE tier = ?', ['SILVER']),
            db.execute('SELECT COUNT(*) as count FROM keywords WHERE tier = ?', ['BRONZE'])
        ]);

        total = (totalResult.rows[0]?.count as number) || 0;
        analyzed = (analyzedResult.rows[0]?.count as number) || 0;
        expanded = (expandedResult.rows[0]?.count as number) || 0;
        platinumCount = (platinumResult.rows[0]?.count as number) || 0;
        goldCount = (goldResult.rows[0]?.count as number) || 0;
        silverCount = (silverResult.rows[0]?.count as number) || 0;
        bronzeCount = (bronzeResult.rows[0]?.count as number) || 0;
        newKeywords24h = (newKeywords24hResult.rows[0]?.count as number) || 0;
        docsFilled24h = (docsFilled24hResult.rows[0]?.count as number) || 0;
        recentLogs = logsResult.rows.map(row => ({
            id: row.id,
            keyword: row.keyword,
            total_search_cnt: row.total_search_cnt,
            tier: row.tier,
            created_at: row.created_at
        }));
        pendingDocs = Math.max(total - analyzed, 0);

        // 시드키워드 현황
        seedKeywordsTotal = (seedTotalResult.rows[0]?.count as number) || 0;
        seedKeywordsPending = (seedPendingResult.rows[0]?.count as number) || 0;
        seedKeywordsExpanded = (seedExpandedResult.rows[0]?.count as number) || 0;
        seedKeywordsProcessing = (seedProcessingResult.rows[0]?.count as number) || 0;
        recentSeeds = recentSeedsResult.rows.map(row => ({
            keyword: row.keyword,
            total_search_cnt: row.total_search_cnt,
            is_expanded: row.is_expanded,
            updated_at: row.updated_at
        }));

    } catch (e: any) {
        console.error('Monitor Page Error:', e);
        errorMsg = e.message || 'Failed to fetch data';
    }

    // Calculate Progress
    const analysisProgress = total > 0 ? Math.round((analyzed / total) * 100) : 0;
    const expandProgress = total > 0 ? Math.round((expanded / total) * 100) : 0;

    if (errorMsg) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-4">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                    <h1 className="text-xl font-bold">오류 발생</h1>
                    <p className="text-zinc-500 break-words">{errorMsg}</p>
                    <p className="text-sm text-zinc-400">Vercel 환경변수(TURSO_DATABASE_URL 또는 TURSO_AUTH_TOKEN)를 확인해주세요.</p>
                    <Link href="/" className="inline-block mt-4 px-4 py-2 bg-zinc-900 text-white rounded-lg">홈으로 이동</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black p-6 md:p-12">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <Activity className="w-8 h-8 text-emerald-500" />
                            System Monitor
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                            실시간 수집 현황 및 데이터 분석 대시보드
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/" className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                            돌아가기
                        </Link>
                    </div>
                </div>

                {/* Key Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard
                        title="총 키워드"
                        value={total.toLocaleString()}
                        icon={<Database className="w-5 h-5" />}
                        desc="수집된 전체 키워드"
                    />
                    <StatCard
                        title="최근 24시간 키워드"
                        value={newKeywords24h.toLocaleString()}
                        icon={<TrendingUp className="w-5 h-5" />}
                        desc="새로 수집된 키워드(24h)"
                        color="emerald"
                    />
                    <StatCard
                        title="최근 24시간 문서수"
                        value={docsFilled24h.toLocaleString()}
                        icon={<Search className="w-5 h-5" />}
                        desc="문서수 분석 완료(24h)"
                        color="blue"
                    />
                    <StatCard
                        title="분석 완료"
                        value={`${analyzed.toLocaleString()} (${analysisProgress}%)`}
                        icon={<Search className="w-5 h-5" />}
                        desc="문서량 분석 완료"
                        progress={analysisProgress}
                        color="emerald"
                    />
                    <StatCard
                        title="문서수 수집"
                        value={`${analyzed.toLocaleString()} / ${pendingDocs.toLocaleString()}`}
                        icon={<Search className="w-5 h-5" />}
                        desc="완료 / 미완료"
                        color="blue"
                    />
                    <StatCard
                        title="확장 완료"
                        value={`${expanded.toLocaleString()} (${expandProgress}%)`}
                        icon={<Layers className="w-5 h-5" />}
                        desc="연관검색어 확장 완료"
                        progress={expandProgress}
                        color="blue"
                    />
                    <StatCard
                        title="황금 키워드"
                        value={((platinumCount || 0) + (goldCount || 0)).toLocaleString()}
                        icon={<TrendingUp className="w-5 h-5" />}
                        desc="플래티넘 + 골드 등급"
                        color="amber"
                    />
                    <StatCard
                        title="API 키 상태"
                        value={`AD ${adKeyStatus.available}/${adKeyStatus.total} • SRCH ${searchKeyStatus.available}/${searchKeyStatus.total}`}
                        icon={<KeyRound className="w-5 h-5" />}
                        desc={`대기 AD ${adKeyStatus.cooling}, SRCH ${searchKeyStatus.cooling}`}
                        color={(adKeyStatus.available > 0 && searchKeyStatus.available > 0) ? 'emerald' : 'amber'}
                    />
                </div>

                {/* Detailed Analysis Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* Tier Distribution */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-zinc-500" />
                            등급별 분포 (Tier Distribution)
                        </h3>
                        <div className="space-y-4">
                            <TierBar label="PLATINUM (비율 10+)" count={platinumCount || 0} total={analyzed} color="bg-cyan-500" />
                            <TierBar label="GOLD (비율 5+)" count={goldCount || 0} total={analyzed} color="bg-yellow-500" />
                            <TierBar label="SILVER (비율 1+)" count={silverCount || 0} total={analyzed} color="bg-zinc-400" />
                            <TierBar label="BRONZE (비율 0+)" count={bronzeCount || 0} total={analyzed} color="bg-amber-600" />
                        </div>
                        <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-sm text-zinc-500">
                            💡 <b>Platinum</b>은 검색량 대비 문서수가 매우 적은 '빈집' 키워드입니다. 우선적으로 포스팅 주제로 선정하세요.
                        </div>
                    </div>

                    {/* Recent Keywords */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                            <Search className="w-5 h-5 text-zinc-500" />
                            최근 발견된 키워드
                        </h3>
                        <div className="space-y-3">
                            {recentLogs && recentLogs.map((log: any) => (
                                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border border-zinc-100 dark:border-zinc-800">
                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                        {log.keyword}
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-zinc-400">
                                            {log.total_search_cnt?.toLocaleString()}회
                                        </span>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${getTierColor(log.tier)}`}>
                                            {log.tier || 'PENDING'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {(!recentLogs || recentLogs.length === 0) && (
                                <div className="text-center py-10 text-zinc-500">
                                    아직 데이터가 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Seed Keywords Status Section */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-zinc-500" />
                        시드키워드 현황 (검색량 100+)
                    </h3>

                    {/* Seed Keywords Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-lg">
                            <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">총 시드키워드</div>
                            <div className="text-2xl font-bold font-mono">{seedKeywordsTotal.toLocaleString()}</div>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
                            <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">확장 대기</div>
                            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">{seedKeywordsPending.toLocaleString()}</div>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg">
                            <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">확장 완료</div>
                            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{seedKeywordsExpanded.toLocaleString()}</div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                            <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">확장 진행중</div>
                            <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">{seedKeywordsProcessing.toLocaleString()}</div>
                        </div>
                    </div>

                    {/* Recent Seed Keywords */}
                    <div>
                        <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">검색량 상위 시드키워드 (최대 20개)</h4>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {recentSeeds && recentSeeds.length > 0 ? (
                                recentSeeds.map((seed: any, idx: number) => {
                                    const statusText = seed.is_expanded === 0 ? '대기' : seed.is_expanded === 1 ? '완료' : '진행중';
                                    const statusColor = seed.is_expanded === 0 ? 'text-amber-600 bg-amber-100 dark:bg-amber-900/30'
                                        : seed.is_expanded === 1 ? 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30'
                                            : 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';

                                    return (
                                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border border-zinc-100 dark:border-zinc-800">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-zinc-400 font-mono w-8">#{idx + 1}</span>
                                                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                                    {seed.keyword}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-zinc-400">
                                                    {seed.total_search_cnt?.toLocaleString()}회
                                                </span>
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${statusColor}`}>
                                                    {statusText}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-10 text-zinc-500">
                                    시드키워드가 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Mining Control Panel */}
                <MiningControls />

            </div>

            {/* Auto Refresh Component - refreshes page every 10 minutes */}
            <AutoRefresh interval={600000} />
        </div>
    );
}

// Sub Components
function StatCard({ title, value, icon, desc, progress, color = "emerald" }: StatCardProps) {
    return (
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group hover:border-emerald-500/30 transition-all">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h4 className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-1">{title}</h4>
                    <div className="text-2xl font-bold font-mono tracking-tight">{value}</div>
                </div>
                <div className={`p-2 rounded-lg bg-${color}-100 dark:bg-${color}-900/20 text-${color}-600 dark:text-${color}-400 group-hover:scale-110 transition-transform`}>
                    {icon}
                </div>
            </div>

            {progress !== undefined && (
                <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 mb-2 overflow-hidden">
                    <div
                        className={`bg-${color}-500 h-1.5 rounded-full transition-all duration-1000`}
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            )}

            <p className="text-xs text-zinc-400">{desc}</p>
        </div>
    );
}

function TierBar({ label, count, total, color }: TierBarProps) {
    const percent = total > 0 ? (count / total) * 100 : 0;
    return (
        <div>
            <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
                <span className="text-zinc-500">{count.toLocaleString()} ({percent.toFixed(1)}%)</span>
            </div>
            <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                <div
                    className={`${color} h-2.5 rounded-full transition-all duration-1000`}
                    style={{ width: `${percent}%` }}
                ></div>
            </div>
        </div>
    );
}
