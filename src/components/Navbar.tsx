
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pickaxe, Menu, X } from 'lucide-react';

import MonitoringStatus from './MonitoringStatus';

export default function Navbar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    const isActive = (path: string) => pathname === path;
    const closeMenu = () => setIsOpen(false);

    const NavLinks = () => (
        <>
            <Link
                href="/"
                onClick={closeMenu}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/') ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
            >
                홈
            </Link>
            <Link
                href="/data"
                onClick={closeMenu}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/data') ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
            >
                데이터
            </Link>
            <Link
                href="/insight"
                onClick={closeMenu}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/insight') ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
            >
                인사이트
            </Link>
            <Link
                href="/bulk"
                onClick={closeMenu}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/bulk') ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
            >
                대량조회
            </Link>
            <Link
                href="/monitor"
                onClick={closeMenu}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/monitor') ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
            >
                모니터링
            </Link>
        </>
    );

    return (
        <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 font-bold text-lg" onClick={closeMenu}>
                        <div className="p-1.5 bg-zinc-900 dark:bg-white rounded-md">
                            <Pickaxe className="w-5 h-5 text-white dark:text-zinc-900" />
                        </div>
                        <span>GoldenKey</span>
                    </Link>

                    {/* Desktop Nav */}
                    <div className="hidden md:flex gap-1">
                        <NavLinks />
                    </div>
                </div>

                {/* Mobile Menu Button */}
                <button
                    className="md:hidden p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Mobile Nav */}
            {isOpen && (
                <div className="md:hidden border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-4 flex flex-col gap-2">
                    <NavLinks />
                </div>
            )}
        </nav>
    );
}
