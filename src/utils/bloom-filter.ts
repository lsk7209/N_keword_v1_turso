
/**
 * 🌸 Bloom Filter Utility
 * 
 * Turso Row Reads 비용을 절감하기 위한 확률적 필터.
 * 1MB의 비이트맵으로 약 100만개의 키워드 중복을 99% 확률로 사전 차단.
 */

export class BloomFilter {
    private size: number;
    private buffer: Uint8Array;
    private hashCounts: number = 3;

    constructor(sizeInBytes: number = 1024 * 1024, existingData?: Uint8Array) {
        this.size = sizeInBytes * 8;
        this.buffer = existingData || new Uint8Array(sizeInBytes);
    }

    private getHashes(str: string): number[] {
        let h1 = 5381;
        let h2 = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            h1 = (h1 << 5) + h1 + char;
            h2 = (h2 << 5) - h2 + char;
        }

        const hashes = [];
        for (let i = 0; i < this.hashCounts; i++) {
            hashes.push(Math.abs(h1 + i * h2) % this.size);
        }
        return hashes;
    }

    add(str: string): void {
        const hashes = this.getHashes(str);
        hashes.forEach(hash => {
            const byteIdx = Math.floor(hash / 8);
            const bitIdx = hash % 8;
            this.buffer[byteIdx] |= (1 << bitIdx);
        });
    }

    maybeExists(str: string): boolean {
        const hashes = this.getHashes(str);
        return hashes.every(hash => {
            const byteIdx = Math.floor(hash / 8);
            const bitIdx = hash % 8;
            return (this.buffer[byteIdx] & (1 << bitIdx)) !== 0;
        });
    }

    // Alias for maybeExists
    has(str: string): boolean {
        return this.maybeExists(str);
    }

    export(): Uint8Array {
        return this.buffer;
    }
}
