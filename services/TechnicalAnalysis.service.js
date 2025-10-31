import {
    fileURLToPath
} from 'url';
import {
    spawn
} from 'child_process';
import path from 'path';
import binancePriceService from './BinancePrice.service.js';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

class TechnicalAnalysisService {
    constructor() {
        this.pythonScriptPath = path.join(__dirname, '../python/technical_indicators.py');
        this.pythonBinPath = path.join(__dirname, '../python/venv/bin/python3');
        this.priceCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async runPythonScript(prices, indicator, volumes = null, highs = null, lows = null) {
        return new Promise((resolve, reject) => {
            const args = [
                this.pythonScriptPath,
                JSON.stringify(prices),
                indicator
            ];

            if (volumes) args.push(JSON.stringify(volumes));
            if (highs) args.push(JSON.stringify(highs));
            if (lows) args.push(JSON.stringify(lows));

            const pythonProcess = spawn(this.pythonBinPath, args);

            let result = '';
            let error = '';

            pythonProcess.stdout.on('data', (data) => {
                result += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                error += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python script failed: ${error}`));
                } else {
                    resolve(result.trim());
                }
            });
        });
    }

    async getPriceData(symbol) {
        if (!symbol) {
            throw new Error('Symbol is required');
        }

        // Check cache first
        if (this.priceCache.has(symbol)) {
            const cachedData = this.priceCache.get(symbol);
            const age = Date.now() - cachedData.timestamp;

            if (age < this.cacheTimeout) {
                console.log(`✅ Price cache HIT for ${symbol} (age: ${Math.round(age/1000)}s)`);
                return cachedData.data;
            } else {
                console.log(`🔄 Cache expired for ${symbol}, refreshing...`);
                this.priceCache.delete(symbol);
            }
        }

        console.log(`🚀 Fetching fresh price data from Binance for ${symbol}...`);

        try {
            // ✅ Use Binance for INSTANT data
            const [currentInfo, historicalData] = await Promise.all([
                binancePriceService.getCurrentPrice(symbol),
                binancePriceService.getHistoricalData(symbol, 100)
            ]);

            const dataCoin = {
                [symbol]: {
                    current_price: currentInfo.price,
                    volumes: historicalData.volumes,
                    highs: currentInfo.high24h,
                    lows: currentInfo.low24h,
                    prices: historicalData.prices
                }
            };

            this.priceCache.set(symbol, {
                data: dataCoin,
                timestamp: Date.now()
            });

            return dataCoin;
        } catch (error) {
            console.error(`❌ Failed to fetch price data for ${symbol}:`, error.message);
            throw error;
        }
    }

    async calculateAllIndicators(symbol) {
        if (!symbol) {
            throw new Error('Symbol is required for technical analysis');
        }

        const priceData = await this.getPriceData(symbol);

        if (!priceData[symbol]) {
            throw new Error(`No price data found for ${symbol}`);
        }

        const result = await this.runPythonScript(
            priceData[symbol].prices,
            'all',
            priceData[symbol].volumes,
            priceData[symbol].highs,
            priceData[symbol].lows
        );

        return result;
    }

    async getTechnicalIndicators(symbol) {
        if (!symbol) {
            console.error('❌ Symbol is undefined or null');
            throw new Error('Symbol is required');
        }

        try {
            const allIndicators = await this.calculateAllIndicators(symbol);

            if (allIndicators.error) {
                throw new Error(allIndicators.error);
            }

            const formattedResult = {
                // RSI
                rsi: allIndicators.rsi?.value || 50,
                rsi_signal: allIndicators.rsi?.signal || 'NEUTRAL',
                rsi_message: allIndicators.rsi?.message || '',

                // MACD
                macd: allIndicators.macd?.macd || 0,
                macd_signal: allIndicators.macd?.signal || 0,
                macd_histogram: allIndicators.macd?.histogram || 0,
                macd_trend: allIndicators.macd?.trend || 'NEUTRAL',
                macd_message: allIndicators.macd?.message || '',

                // EMA
                ema: allIndicators.ema?.ema_value || 45000,
                ema_signal: allIndicators.ema?.signal || 'NEUTRAL',
                ema_message: allIndicators.ema?.message || '',

                // SMA
                sma: allIndicators.sma?.sma_value || 45000,
                sma_signal: allIndicators.sma?.signal || 'NEUTRAL',
                sma_message: allIndicators.sma?.message || '',

                // Volume
                volume: allIndicators.volume?.current_volume || 1000000000,
                volume_signal: allIndicators.volume?.signal || 'NEUTRAL',
                volume_message: allIndicators.volume?.message || '',

                // Bollinger Bands
                bollinger: {
                    upper: allIndicators.bollinger?.upper_band || 50000,
                    lower: allIndicators.bollinger?.lower_band || 40000,
                    middle: allIndicators.bollinger?.middle_band || 45000,
                    signal: allIndicators.bollinger?.signal || 'NEUTRAL',
                    message: allIndicators.bollinger?.message || ''
                },

                // Stochastic
                stochastic: {
                    k: allIndicators.stochastic?.k_percent || 50,
                    d: allIndicators.stochastic?.d_percent || 50,
                    signal: allIndicators.stochastic?.signal || 'NEUTRAL',
                    message: allIndicators.stochastic?.message || ''
                },

                // Summary
                summary: allIndicators.summary || {
                    overall_signal: 'NEUTRAL',
                    recommendation: 'Quan sát thêm',
                    confidence: 0
                },

                // Metadata
                timestamp: Date.now(),
                symbol: symbol
            };

            return formattedResult;

        } catch (error) {
            console.error(`❌ Error getTechnicalIndicators for ${symbol}:`, error);
            throw error;
        }
    }
}

export default new TechnicalAnalysisService();