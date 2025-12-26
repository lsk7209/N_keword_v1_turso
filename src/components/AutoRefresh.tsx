'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AutoRefreshProps {
    interval?: number; // milliseconds, default 10 minutes
}

export default function AutoRefresh({ interval = 600000 }: AutoRefreshProps) {
    const router = useRouter();

    useEffect(() => {
        const timer = setInterval(() => {
            router.refresh();
        }, interval);

        return () => clearInterval(timer);
    }, [router, interval]);

    return null; // This component doesn't render anything
}

