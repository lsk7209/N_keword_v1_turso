
'use client';

import { useState, useEffect, useRef } from 'react';
import { triggerMining, setMiningMode, getMiningMode } from '@/app/actions';
import { Play, FastForward, Square, Zap, CheckCircle2 } from 'lucide-react';

export default function MiningControls() {
    const [isTurbo, setIsTurbo] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const isInitialLoadRef = useRef(true);

    // 컴포넌트 마운트 시 DB에서 현재 모드 확인 (브라우저 새로고침 후에도 유지)
    useEffect(() => {
        const checkMode = async () => {
            try {
                console.log('[MiningControls] Checking mode from DB...');
                const result = await getMiningMode();
                console.log('[MiningControls] Mode check result:', result);
                
                if (result.success) {
                    setIsTurbo(prevTurbo => {
                        const wasTurbo = prevTurbo;
                        const isNowTurbo = result.mode === 'TURBO';
                        
                        console.log('[MiningControls] Mode state update:', { wasTurbo, isNowTurbo, isInitial: isInitialLoadRef.current });
                        
                        // 초기 로드 시 또는 상태 변경 감지
                        if (isInitialLoadRef.current) {
                            if (isNowTurbo) {
                                const time = new Date().toLocaleTimeString();
                                setLogs(prev => [`[${time}] 🔄 터보 모드가 활성화되어 있습니다. (DB에서 복원)`, ...prev].slice(0, 50));
                            } else {
                                const time = new Date().toLocaleTimeString();
                                setLogs(prev => [`[${time}] ℹ️ 일반 모드입니다.`, ...prev].slice(0, 50));
                            }
                            isInitialLoadRef.current = false;
                        } else {
                            // 주기적 확인 중 상태 변경 감지
                            if (isNowTurbo && !wasTurbo) {
                                const time = new Date().toLocaleTimeString();
                                setLogs(prev => [`[${time}] 🔄 터보 모드가 활성화되어 있습니다.`, ...prev].slice(0, 50));
                            } else if (!isNowTurbo && wasTurbo) {
                                const time = new Date().toLocaleTimeString();
                                setLogs(prev => [`[${time}] ⚠️ 터보 모드가 자동으로 중지되었습니다. (API 키 소진 또는 오류)`, ...prev].slice(0, 50));
                            }
                        }
                        
                        return isNowTurbo;
                    });
                } else {
                    console.error('[MiningControls] Failed to get mode:', result.error);
                    // 실패 시에도 기본값으로 설정
                    setIsTurbo(false);
                }
            } catch (e: any) {
                console.error('[MiningControls] Mode check error:', e);
                setIsTurbo(false);
            }
        };
        
        // 초기 로드 시 즉시 확인
        checkMode();

        // 주기적으로 상태 확인 (API 키 소진으로 자동 중지된 경우 감지)
        const interval = setInterval(() => {
            checkMode().catch(console.error);
        }, 10000); // 10초마다 확인

        return () => clearInterval(interval);
    }, []); // 빈 의존성 배열: 마운트 시에만 실행

    const addLog = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
    };

    const handleNormalClick = async () => {
        if (isLoading) return;
        setIsLoading(true);
        addLog('▶ 일반 배치 시작 (1회 실행)...');

        try {
            await setMiningMode('NORMAL'); // Ensure turbo is off
            const result = await triggerMining();

            if (result.success) {
                const expandInfo = result.expand ? `확장 ${result.expand.totalSaved}개` : '확장 없음';
                addLog(`✅ 성공: ${expandInfo}`);
            } else {
                addLog(`❌ 실패: ${result.error}`);
            }
        } catch (e: any) {
            addLog(`❌ 오류: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTurboToggle = async () => {
        if (isLoading) return;
        setIsLoading(true);

        try {
            if (isTurbo) {
                // STOPPING
                addLog('🛑 터보 모드 중지 요청 중 (DB 플래그 해제)...');
                await setMiningMode('NORMAL');
                setIsTurbo(false);
                addLog('✅ 중지 완료. 현재 실행 중인 배치가 끝나면 멈춥니다.');
            } else {
                // STARTING
                addLog('🚀 터보 모드 가동 요청 (DB 플래그 설정)...');
                await setMiningMode('TURBO');

                // Kickstart the first run
                addLog('🔥 백그라운드 체인 시작 (첫 배치 실행)...');
                triggerMining().then(() => {
                    // We don't await this fully to unblock UI, server action awaits response but we let it run
                    addLog('📡 첫 배치 전송 완료. 이제 서버가 스스로 반복 실행합니다.');
                });

                setIsTurbo(true);
                addLog('✨ 백그라운드 작업이 시작되었습니다. 이 탭을 닫아도 계속 수집됩니다.');
            }
        } catch (e: any) {
            addLog(`❌ 모드 변경 오류: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-8 bg-blue-600 rounded-full inline-block"></span>
                    수집 제어 패널 (Server-Side)
                </h2>
                <div className="flex gap-2">
                    {isTurbo && (
                        <div className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold animate-pulse flex items-center gap-1">
                            <Zap size={12} fill="currentColor" />
                            TURBO ACTIVE
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 일반 수집 버튼 */}
                <button
                    onClick={handleNormalClick}
                    disabled={isLoading || isTurbo}
                    className={`flex items-center justify-center gap-3 p-4 rounded-xl border transition-all
                        ${(isLoading || isTurbo)
                            ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-white border-slate-200 hover:border-blue-500 hover:text-blue-600 hover:shadow-md text-slate-700'
                        }`}
                >
                    <Play size={24} />
                    <div className="text-left">
                        <div className="font-bold">일반 수집 (1회)</div>
                        <div className="text-xs opacity-70">즉시 실행 및 결과 확인</div>
                    </div>
                </button>

                {/* 터보 수집 버튼 */}
                <button
                    onClick={handleTurboToggle}
                    disabled={isLoading}
                    className={`flex items-center justify-center gap-3 p-4 rounded-xl border transition-all text-white
                        ${isTurbo
                            ? 'bg-zinc-800 border-zinc-900 hover:bg-zinc-900 shadow-inner'
                            : 'bg-gradient-to-br from-indigo-500 to-purple-600 border-transparent hover:shadow-lg hover:from-indigo-600 hover:to-purple-700'
                        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isTurbo ? (
                        <>
                            <Square size={24} className="fill-current" />
                            <div className="text-left">
                                <div className="font-bold">터보 중지 (Stop)</div>
                                <div className="text-xs opacity-90">백그라운드 루프 종료</div>
                            </div>
                        </>
                    ) : (
                        <>
                            <FastForward size={24} />
                            <div className="text-left">
                                <div className="font-bold">터보 모드 (Start)</div>
                                <div className="text-xs opacity-90">서버 백그라운드 무한 실행</div>
                            </div>
                        </>
                    )}
                </button>
            </div>

            {/* 로그 창 */}
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs md:text-sm text-slate-300 h-48 overflow-y-auto space-y-1 shadow-inner">
                {logs.length === 0 && (
                    <div className="h-full flex items-center justify-center text-slate-600 italic">
                        대기 중...
                    </div>
                )}
                {logs.map((log, i) => (
                    <div key={i} className="border-b border-white/5 last:border-0 pb-1 last:pb-0 break-all leading-relaxed">
                        {log}
                    </div>
                ))}
            </div>

            <div className="text-xs text-slate-400 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                    <CheckCircle2 size={12} />
                    <span>터보 모드는 브라우저를 닫아도 서버에서 계속 실행됩니다. (Vercel Chaining)</span>
                </div>
                {!isTurbo && (
                    <div className="flex items-center justify-center gap-1 text-blue-400">
                        <CheckCircle2 size={12} />
                        <span>일반 모드: GitHub Actions가 5분마다 자동으로 수집을 진행합니다.</span>
                    </div>
                )}
            </div>
        </div>
    );
}
