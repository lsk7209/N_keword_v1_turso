
import Link from 'next/link';

export default function Footer() {
    return (
        <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 mt-auto">
            <div className="max-w-7xl mx-auto px-4 py-6 md:flex md:items-center md:justify-between">
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    © {new Date().getFullYear()} Golden Keyword Miner. All rights reserved.
                </div>
                <div className="flex space-x-6 mt-4 md:mt-0">
                    <Link href="/about" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                        소개
                    </Link>
                    <Link href="/contact" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                        문의
                    </Link>
                    <Link href="/privacy" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                        개인정보 처리방침
                    </Link>
                </div>
            </div>
        </footer>
    );
}
