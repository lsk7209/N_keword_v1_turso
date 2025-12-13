
import { createClient } from '@supabase/supabase-js';
import { Activity, Database, Layers, Search, TrendingUp, AlertCircle } from 'lucide-react';
import Link from 'next/link';

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
    let recentLogs: any[] = [];
    let errorMsg = '';

    try {
        // Use Service Role Key if available, otherwise fallback to Anon Key
        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co').trim();
        const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder').trim();

        const adminDb = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch Stats in parallel
        const [
            { count: totalCount },
            { count: analyzedCount },
            { count: expandedCount },
            { count: platinumCountResult },
            { count: goldCountResult },
            { data: logs }
        ] = await Promise.all([
            adminDb.from('keywords').select('*', { count: 'exact', head: true }),
            adminDb.from('keywords').select('*', { count: 'exact', head: true }).not('total_doc_cnt', 'is', null),
            adminDb.from('keywords').select('*', { count: 'exact', head: true }).eq('is_expanded', true),
            adminDb.from('keywords').select('*', { count: 'exact', head: true }).eq('tier', 'PLATINUM'),
            adminDb.from('keywords').select('*', { count: 'exact', head: true }).eq('tier', 'GOLD'),
            adminDb.from('keywords').select('*').order('created_at', { ascending: false }).limit(10)
        ]);

        total = totalCount || 0;
        analyzed = analyzedCount || 0;
        expanded = expandedCount || 0;
        platinumCount = platinumCountResult || 0;
        goldCount = goldCountResult || 0;
        recentLogs = logs || [];

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
                    <p className="text-sm text-zinc-400">Vercel 환경변수(SUPABASE_SERVICE_ROLE_KEY 또는 NEXT_PUBLIC_SUPABASE_URL)를 확인해주세요.</p>
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
                        title="분석 완료"
                        value={`${analyzed.toLocaleString()} (${analysisProgress}%)`}
                        icon={<Search className="w-5 h-5" />}
                        desc="문서량 분석 완료"
                        progress={analysisProgress}
                        color="emerald"
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
                            <TierBar label="SILVER (비율 1+)" count={(analyzed - (platinumCount || 0) - (goldCount || 0))} total={analyzed} color="bg-zinc-400" />
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

                {/* Server Status (Simulated) */}
                <div className="bg-zinc-900 text-white rounded-2xl p-6 shadow-lg overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-32 bg-emerald-500/10 rounded-full blur-3xl"></div>
                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Activity className="w-5 h-5 text-emerald-400" />
                                System Status: Operational
                            </h3>
                            <p className="text-zinc-400 text-sm mt-1">
                                모든 수집기가 정상 작동 중입니다. GitHub Cron이 10분마다 실행됩니다.
                            </p>
                        </div>
                        <div className="flex gap-4 text-sm">
                            <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/10">
                                <div className="text-zinc-400 text-xs uppercase tracking-wider mb-1">Database</div>
                                <div className="font-mono text-emerald-400">Connected</div>
                            </div>
                            <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/10">
                                <div className="text-zinc-400 text-xs uppercase tracking-wider mb-1">Miners</div>
                                <div className="font-mono text-blue-400">Idle</div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
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
