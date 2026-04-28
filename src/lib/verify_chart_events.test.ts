import { describe, it, expect } from 'vitest';

function processEvents(events: any[]) {
    const groups: Record<string, { events: any[], totalValue: number, type: string, date: string }> = {};
    
    events.forEach(event => {
        if (event.type === 'EARNINGS') {
            return;
        }

        if (!event.vestDate && event.comment?.toLowerCase().includes('vest')) {
            return;
        }

        const dateStr = new Date(event.date).toISOString().split('T')[0];
        const type = event.type || 'BUY';
        const key = `${dateStr}_${type}`;
        
        const val = (event.originalQty ?? event.qty ?? 0) * (event.originalPrice ?? event.price ?? 0);
        
        if (!groups[key]) {
            groups[key] = { events: [], totalValue: 0, type, date: event.date };
        }
        groups[key].events.push(event);
        groups[key].totalValue += val;
    });

    const aggregatedEvents: any[] = [];
    for (const key in groups) {
        const g = groups[key];
        aggregatedEvents.push({
            date: g.date,
            type: g.type,
            totalValue: g.totalValue,
            count: g.events.length,
        });
    }

    events.forEach(event => {
        if (event.type === 'EARNINGS') {
            aggregatedEvents.push(event);
        }
    });

    const sortedEvents = aggregatedEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let currentHeightIndex = 0;
    let lastDate = 0;
    
    return sortedEvents.map(event => {
        const date = new Date(event.date).getTime();
        const diffDays = Math.abs(date - lastDate) / (1000 * 60 * 60 * 24);
        if (diffDays <= 5) {
            currentHeightIndex = (currentHeightIndex + 1) % 4;
        } else {
            currentHeightIndex = 0;
        }
        lastDate = date;
        return { ...event, heightIndex: currentHeightIndex };
    });
}

describe('processEvents', () => {
    it('should sum events on the same day', () => {
        const events = [
            { date: '2026-01-01', type: 'BUY', qty: 10, price: 100 },
            { date: '2026-01-01', type: 'BUY', qty: 20, price: 100 },
            { date: '2026-01-02', type: 'SELL', qty: 5, price: 200 },
        ];

        const result = processEvents(events);
        expect(result.length).toBe(2);
        expect(result[0].totalValue).toBe(3000);
        expect(result[0].count).toBe(2);
        expect(result[1].totalValue).toBe(1000);
    });

    it('should filter out vesting events based on comment', () => {
        const events = [
            { date: '2026-01-01', type: 'BUY', qty: 10, price: 100 },
            { date: '2026-01-02', type: 'BUY', qty: 10, price: 100, comment: 'Vesting package' },
        ];

        const result = processEvents(events);
        expect(result.length).toBe(1);
        expect(result[0].date).toBe('2026-01-01');
    });

    it('should NOT filter out vesting events if vestDate is populated (grant)', () => {
        const events = [
            { date: '2026-01-01', type: 'BUY', qty: 10, price: 100, vestDate: '2026-06-01', comment: 'Vesting package' },
        ];

        const result = processEvents(events);
        expect(result.length).toBe(1);
    });
});
