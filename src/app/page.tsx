
import Link from 'next/link';
import { ArrowRight, BarChart3, Search, Zap } from 'lucide-react';
import ManualMiner from '@/components/ManualMiner';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      {/* Hero Section */}
      {/* Hero Section & Manual Miner */}
      <section className="flex-1 flex flex-col justify-center items-center text-center px-4 py-20 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-black">
        <div className="max-w-4xl w-full space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-zinc-900 dark:text-white">
              네이버 <span className="text-primary text-emerald-600">황금키워드</span> 채굴기
            </h1>
            <p className="text-xl text-zinc-500 dark:text-zinc-400">
              키워드를 입력하면 연관 검색어를 분석하여 '빈집'을 찾아냅니다.
            </p>
          </div>

          {/* Mining Input */}
          <div className="bg-white dark:bg-zinc-800 p-6 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-700 max-w-2xl mx-auto">
            <ManualMiner />
          </div>
        </div>
      </section>

      {/* Feature Section */}
      <section className="bg-white dark:bg-zinc-900 py-20 border-t border-zinc-100 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 bg-zinc-50 dark:bg-zinc-800 rounded-xl space-y-4">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center">
              <Search className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold">자동 키워드 발굴</h3>
            <p className="text-zinc-500 dark:text-zinc-400">
              시드 키워드 하나만 입력하면 연관 검색어를 자동으로 확장하고 분석합니다.
            </p>
          </div>
          <div className="p-6 bg-zinc-50 dark:bg-zinc-800 rounded-xl space-y-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-bold">실시간 경쟁도 분석</h3>
            <p className="text-zinc-500 dark:text-zinc-400">
              총 검색량 대비 문서 수(Golden Ratio)를 분석하여 빈집 키워드를 선별합니다.
            </p>
          </div>
          <div className="p-6 bg-zinc-50 dark:bg-zinc-800 rounded-xl space-y-4">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-xl font-bold">즉각적인 인사이트</h3>
            <p className="text-zinc-500 dark:text-zinc-400">
              직관적인 대시보드와 골드/실버 등급 시스템으로 포스팅 주제를 즉시 결정하세요.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
