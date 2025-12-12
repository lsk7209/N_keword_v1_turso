
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pickaxe } from 'lucide-react';

import MonitoringStatus from './MonitoringStatus';

export default function Navbar() {
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path;

    return (
        <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 font-bold text-lg">
                        <div className="p-1.5 bg-zinc-900 dark:bg-white rounded-md">
                            <Pickaxe className="w-5 h-5 text-white dark:text-zinc-900" />
                        </div>
                        <span>GoldenKey</span>
                    </Link>

                    <div className="hidden md:flex gap-1">
                        <Link
                            href="/"
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/') ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
                        >
                            홈
                        </Link>
                        <Link
                            href="/data"
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/data') ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
                        >
                            데이터
                        </Link>
                        <Link
                            href="/insight"
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/insight') ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
                        >
                            인사이트
                        </Link>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <MonitoringStatus />
                </div>
            </div>
        </nav>
    );
}
