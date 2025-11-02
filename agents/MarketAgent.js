import EventEmitter from 'events';
import WebSocket from 'ws';

class MarketAgent extends EventEmitter {
    constructor() {
        super();
        this.connections = new Map();
        this.isRunning = false;
        this.priceCache = new Map();
        this.config = null;
    }

    async start(config) {
        this.config = config;
        this.isRunning = true;

        await this.setupWebSocketConnections();

        console.log('🌐 Market Agent started (WebSocket only)');
    }

    async setupWebSocketConnections() {
        const symbols = this.config.symbols || ['BTCUSDT', 'ETHUSDT'];
        symbols.forEach(symbol => {
            const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);

            ws.on('open', () => {
                console.log(`🔗 Connected to ${symbol} stream`);
            });

            ws.on('message', (data) => {
                const ticker = JSON.parse(data);
                this.handlePriceUpdate(symbol, ticker);
            });

            ws.on('error', (error) => {
                console.error(`❌ WebSocket error for ${symbol}:`, error);
                setTimeout(() => this.reconnect(symbol), 5000);
            });
            ws.on('close', () => {
                console.warn(`⚠️ WebSocket closed for ${symbol}, reconnecting...`);
                setTimeout(() => this.reconnect(symbol), 3000);
            });

            this.connections.set(symbol, ws);
        });
    }


    reconnect(symbol) {
        if (this.connections.has(symbol)) {
            const oldWs = this.connections.get(symbol);
            if (oldWs.readyState === WebSocket.OPEN) return;
            oldWs.terminate();
        }

        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
        this.connections.set(symbol, ws);
    }

    handlePriceUpdate(symbol, ticker) {
        const priceData = {
            symbol: symbol,
            price: parseFloat(ticker.c),
            change24h: parseFloat(ticker.p),
            volume: parseFloat(ticker.v),
            timestamp: Date.now()
        };

        this.priceCache.set(symbol, priceData);
        this.emit('priceUpdate', priceData);

        if (Math.abs(priceData.change24h) > 5) {
            this.emit('significantPriceMove', priceData);
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            activeConnections: this.connections.size,
            cachedPrices: this.priceCache.size,
            lastUpdated: Date.now()
        };
    }

    stop() {
        this.connections.forEach(ws => ws.close());
        this.connections.clear();
        this.isRunning = false;
        console.log('🌐 Market Agent stopped');
    }
}

export default MarketAgent;