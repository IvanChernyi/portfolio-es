// reference data

export interface Instrument {
    symbol: string;
    name: string;
}

export const INSTRUMENTS: Instrument[] = [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'NVDA', name: 'Nvidia' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'JNJ', name: 'Johnson & Johnson' },
    { symbol: 'XOM', name: 'Exxon Mobil' },
];

export function isKnownSymbol(symbol: string): boolean {
    return INSTRUMENTS.some((i) => i.symbol === symbol);
}
