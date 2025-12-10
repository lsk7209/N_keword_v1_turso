
export const BLACKLIST_KEYWORDS = [
    '주식', '코인', '비트코인', '대여', '날씨',
    '토토', '카지노', '성인', '19금', '야동',
    '대출', '보험', '카드', '현금', // Highly competitive/risky
    '무료', '다운로드'
];

export function isBlacklisted(keyword: string): boolean {
    return BLACKLIST_KEYWORDS.some(bad => keyword.includes(bad));
}
