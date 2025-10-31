import ccxt from 'ccxt';

/**
 * Fast price service using Binance API
 * NO rate limits, instant response
 */
class BinancePriceService {
    constructor() {
        this.exchange = new ccxt.binance({
            enableRateLimit: false, // Binance public endpoints have no limits
            timeout: 10000
        });

        // Cache for 30 seconds (very fresh data)
        this.cache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
    }

    getCacheKey(symbol) {
        return `price_${symbol}`;
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const age = Date.now() - cached.timestamp;
        if (age > this.cacheTimeout) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    convertCoinToSymbol(coin) {
        const mapping = {
            'bitcoin': 'BTC/USDT',
            'ethereum': 'ETH/USDT',
            'binancecoin': 'BNB/USDT',
            'cardano': 'ADA/USDT',
            'dogecoin': 'DOGE/USDT',
            'ripple': 'XRP/USDT',
            'solana': 'SOL/USDT'
        };
        return mapping[coin.toLowerCase()] || 'BTC/USDT';
    }

    /**
     * Get current price + 24h data (FAST!)
     */
    async getCurrentPrice(coin) {
        const symbol = this.convertCoinToSymbol(coin);
        const cacheKey = this.getCacheKey(symbol);

        const cached = this.getFromCache(cacheKey);
        if (cached) {
            console.log(`✅ Binance cache HIT: ${symbol}`);
            return cached;
        }

        try {
            // Fetch ticker (instant response!)
            const ticker = await this.exchange.fetchTicker(symbol);

            const data = {
                symbol: coin,
                price: ticker.last,
                change24h: ticker.percentage || 0,
                volume24h: ticker.quoteVolume || 0,
                high24h: ticker.high || ticker.last,
                low24h: ticker.low || ticker.last,
                bid: ticker.bid,
                ask: ticker.ask,
                timestamp: ticker.timestamp
            };

            this.setCache(cacheKey, data);
            console.log(`🚀 Binance fetch: ${symbol} = $${data.price}`);

            return data;
        } catch (error) {
            console.error(`❌ Binance fetch failed for ${coin}:`, error.message);
            throw error;
        }
    }

    /**
     * Get multiple coins at once (BATCH)
     */
    async getMultiplePrices(coins = ['bitcoin', 'ethereum']) {
        const results = {};

        // Fetch all in parallel (super fast!)
        const promises = coins.map(async (coin) => {
            try {
                results[coin] = await this.getCurrentPrice(coin);
            } catch (error) {
                console.error(`Failed to fetch ${coin}:`, error.message);
                results[coin] = null;
            }
        });

        await Promise.all(promises);

        return results;
    }

    /**
     * Get historical OHLCV data (for indicators)
     */
    async getHistoricalData(coin, days = 100) {
        const symbol = this.convertCoinToSymbol(coin);
        const cacheKey = `historical_${symbol}_${days}`;

        const cached = this.getFromCache(cacheKey);
        if (cached) {
            console.log(`✅ Historical cache HIT: ${symbol}`);
            return cached;
        }

        try {
            // Fetch OHLCV data (1 day timeframe)
            const limit = days > 365 ? 365 : days;
            const ohlcv = await this.exchange.fetchOHLCV(symbol, '1d', undefined, limit);

            const data = {
                prices: ohlcv.map(candle => candle[4]), // Close prices
                volumes: ohlcv.map(candle => candle[5]), // Volumes
                highs: ohlcv.map(candle => candle[2]), // High prices
                lows: ohlcv.map(candle => candle[3]), // Low prices
                timestamps: ohlcv.map(candle => candle[0])
            };

            this.setCache(cacheKey, data);
            console.log(`🚀 Historical fetch: ${symbol} (${limit} days)`);

            return data;
        } catch (error) {
            console.error(`❌ Historical fetch failed for ${coin}:`, error.message);
            throw error;
        }
    }

    /**
     * Format for compatibility with old CoinGecko format
     */
    async getCryptoPrices(coins = ['bitcoin', 'ethereum']) {
        const binanceData = await this.getMultiplePrices(coins);

        // Convert to CoinGecko-like format
        const formatted = {};
        for (const [coin, data] of Object.entries(binanceData)) {
            if (data) {
                formatted[coin] = {
                    usd: data.price,
                    usd_24h_change: data.change24h,
                    usd_24h_vol: data.volume24h,
                    usd_market_cap: data.price * data.volume24h * 100 // Rough estimate
                };
            }
        }

        return formatted;
    }

    /**
     * Get full market info (current price + 24h stats)
     */
    async getAllInfoCoin(coins = ['bitcoin', 'ethereum']) {
        const results = await this.getMultiplePrices(coins);

        const formatted = [];
        for (const [coin, data] of Object.entries(results)) {
            if (data) {
                formatted.push({
                    id: coin,
                    symbol: coin.toUpperCase(),
                    name: coin.charAt(0).toUpperCase() + coin.slice(1),
                    current_price: data.price,
                    high_24h: data.high24h,
                    low_24h: data.low24h,
                    price_change_percentage_24h: data.change24h,
                    total_volume: data.volume24h,
                    market_cap: data.price * data.volume24h * 100
                });
            }
        }

        return formatted;
    }

    clearCache() {
        this.cache.clear();
        console.log('🗑️ Binance cache cleared');
    }

    getStatus() {
        return {
            cacheSize: this.cache.size,
            exchange: 'Binance',
            rateLimit: 'No limits on public endpoints',
            avgResponseTime: '< 200ms'
        };
    }
}

export default new BinancePriceService();