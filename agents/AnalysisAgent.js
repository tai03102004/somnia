import axios from 'axios';
import cron from 'node-cron';

import {
    Telegraf
} from 'telegraf';

import technicalIndicators from '../services/TechnicalAnalysis.service.js';
import AlertSystem from '../services/AlertSystem.service.js';
import {
    getAlerts,
    setAlerts
} from '../data/alerts.js';
import EventEmitter from 'events';
import BinanceLiveTrading from '../services/BinanceService.service.js';
import blockchainConnector from '../services/BlockchainConnector.service.js';
import binancePriceService from '../services/BinancePrice.service.js';

/**
 * AI Agent Service Class
 */

class AIAnalysisAgent extends EventEmitter {

    constructor() {
        super();
        this.bot = null;
        this.aiAgent = null;
        this.cronJobs = [];
        this.isRunning = true;
        this.previousPrices = {};
        this.alertSystem = AlertSystem;
        this.orchestrator = null;
        this.binanceLive = BinanceLiveTrading;
        this.blockchainConnector = blockchainConnector;

        this.defaultConfig = {
            checkInterval: '*/30 * * * *',
            quickCheckInterval: '*/5 * * * *',
            supportedCoins: ['bitcoin', 'ethereum'],
            aiInstructions: 'You are a cryptocurrency analysis expert. Analyze the market data and provide trading signals and market insights.',
        };
    }

    /**
     * Initialize service with configuration
     * @param {Object} config - Config service
     */
    init(config) {
        this.config = {
            ...this.defaultConfig,
            ...config
        };

        // Initialize AI Agent
        this.aiAgent = {
            name: this.config.aiName || "Crypto Analysis Agent",
            instructions: this.config.aiInstructions || "You are an assistant professional cryptocurrency trading analyst.",
            model: process.env.GEMINI_MODEL,
            apiKey: process.env.GEMINI,
            baseUrl: process.env.GEMINI_BASE_URL,
            headers: {
                'Authorization': `Bearer ${this.config.aiApiKey}`,
                'Content-Type': 'application/json'
            }
        };

        // Khởi tạo Telegram Bot
        this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        return this;
    }

    // Add method to handle external events
    handleNewsUpdate(newsData) {
        this.lastNewsSentiment = newsData.sentiment;
    }
    updateMarketData(marketData) {
        this.latestMarketData = marketData;
    }
    setOrchestrator(orchestrator) {
        this.orchestrator = orchestrator;
        console.log('🔗 Orchestrator reference set in AnalysisAgent');
    }

    /**
     * Data Analysis with AI
     * @param {string} data - Data to be analyzed
     * @returns {Promise<string>} - Analysis results
     */
    async analyzeWithAI(data) {
        try {
            let enhancedData = data;
            if (this.lastNewsSentiment) {
                enhancedData += `\n\nNews Sentiment: ${this.lastNewsSentiment}`;
            }

            const enhancedPrompt = `
${this.aiAgent.instructions}

Based on the following data, provide:
1. Market analysis (consider news sentiment if provided)
2. Trading signals (if any) with entry point, stop loss, take profit
3. Risk assessment

Data: ${enhancedData}

Please format the response in **clear, human-readable format** using Markdown. Highlight important sections like:

### 🔍 Market Analysis
- A brief but insightful analysis of the market trend

### 📈 Trading Signals
Provide 1–3 trading signals (if applicable). For each signal, include:
- **Coin**: The coin symbol (BTC or ETH)
- **Action**: One of BUY, SELL, or HOLD
- **Confidence**: A number between 0 and 1 (e.g. 0.85)
- **Entry Point**: Suggested price to enter
- **Stop Loss**: Suggested stop loss price
- **Take Profit**: Suggested take profit target
- **Reasoning**: Explain why this signal is generated, based on technical indicators or trend

**Risk Assessment**
- Short bullet points

**Summary**
- Final thoughts or advice
            `.trim();

            const apiUrl = `${this.aiAgent.baseUrl}/models/${this.aiAgent.model}:generateContent`;

            const payload = {
                contents: [{
                    parts: [{
                        text: `${enhancedPrompt}\n\n${data}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024
                }
            };

            const response = await axios.post(apiUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-goog-api-key': this.aiAgent.apiKey
                },
                timeout: 30000
            });

            // ✅ Parse Gemini 2.0 response
            const content = response.data?.candidates?. [0]?.content?.parts?. [0]?.text ||
                'No analysis generated';

            console.log("🔍 AI Analysis Result (first 200 chars):", content.substring(0, 200));

            // Parse trading signals
            if (content.includes("### 📈 Trading Signals") || content.includes("Trading Signals")) {
                const signalRegex = /\*\*Action\*\*:\s*(BUY|SELL|HOLD)[\s\S]*?\*\*Confidence\*\*:\s*([0-9.]+)[\s\S]*?\*\*Entry Point\*\*:\s*\$?([0-9,.]+)[\s\S]*?\*\*Stop Loss\*\*:\s*\$?([0-9,.]+)[\s\S]*?\*\*Take Profit\*\*:\s*\$?([0-9,.]+)[\s\S]*?\*\*Reasoning\*\*:\s*(.+?)(?:\n\n|$)/g;
                const matches = [...content.matchAll(signalRegex)];

                const parsedSignals = matches.map(match => ({
                    coin: match[0].includes('BTC') ? 'bitcoin' : 'ethereum',
                    action: match[1],
                    confidence: parseFloat(match[2]),
                    entryPoint: parseFloat(match[3].replace(/,/g, '')),
                    stopLoss: parseFloat(match[4].replace(/,/g, '')),
                    takeProfit: parseFloat(match[5].replace(/,/g, '')),
                    reasoning: match[6].trim(),
                    timestamp: Date.now()
                }));

                console.log(`✅ Parsed ${parsedSignals.length} signals from AI response`);

                // Submit signals to blockchain
                for (const signal of parsedSignals) {
                    this.emit('tradingSignal', signal);

                    const blockchainResult = await this.blockchainConnector.submitSignal(signal);
                    if (blockchainResult.success) {
                        console.log(`✅ Signal submitted on-chain: ${blockchainResult.txHash}`);
                        signal.txHash = blockchainResult.txHash;
                        signal.blockNumber = blockchainResult.blockNumber;
                    }
                }

                return {
                    analysis: content,
                    signals: parsedSignals,
                    summary: `Generated ${parsedSignals.length} trading signals`
                };
            }

            return {
                analysis: content,
                signals: [],
                summary: "No trading signals generated"
            };

        } catch (error) {
            console.error('❌ AI Analysis Error:', error.message);
            if (error.response) {
                console.error('API Response Status:', error.response.status);
                console.error('API Response Data:', JSON.stringify(error.response.data, null, 2));
            }

            // Return empty result instead of throwing
            return {
                analysis: `AI Analysis Error: ${error.message}. System will continue without AI signals.`,
                signals: [],
                summary: 'Analysis failed - check logs for details'
            };
        }
    }

    /**
     * Warning message format
     * @param {string} symbol 
     * @param {Object} priceData 
     * @param {Object} techData 
     * @param {string} aiAnalysis 
     * @param {Array} alerts
     * @returns {string} 
     */
    formatAlertMessage(symbol, priceData, techData, aiResult, alerts, lstmData = null) {
        const coinData = priceData[symbol];
        const emoji = coinData.usd_24h_change > 0 ? '🟢' : '🔴';
        const trend = coinData.usd_24h_change > 0 ? 'BULLISH' : 'BEARISH';
        const coinName = symbol.charAt(0).toUpperCase() + symbol.slice(1);

        let message = `
            ${emoji} <b>${coinName.toUpperCase()} Analysis</b>

            💰 <b>Price:</b> $${coinData.usd.toFixed(2)}
            📊 <b>24h:</b> ${coinData.usd_24h_change.toFixed(2)}% (${trend})
            📈 <b>Volume:</b> $${(coinData.usd_24h_vol / 1000000).toFixed(2)}M
            💎 <b>Market Cap:</b> $${(coinData.usd_market_cap / 1000000000).toFixed(2)}B

            📋 <b>Technical Indicators:</b>
            • RSI: ${techData.rsi} ${techData.rsi > 70 ? '🔴' : techData.rsi < 30 ? '🟢' : '🟡'}
            • MACD: ${techData.macd.toFixed(2)}
            • EMA: $${techData.ema.toFixed(2)}
            • SMA: $${techData.sma.toFixed(2)}
            • Volume: $${techData.volume.toFixed(2)} ${techData.volume_signal === 'HIGH' ? '🔴' : '🟢'}
            • Bollinger Bands: $${techData.bollinger.upper.toFixed(2)} / $${techData.bollinger.lower.toFixed(2)} / $${techData.bollinger.middle.toFixed(2)}
            • Stochastic: K=${techData.stochastic.k} D=${techData.stochastic.d} ${techData.stochastic.signal === 'OVERBOUGHT' ? '🔴' : techData.stochastic.signal === 'OVERSOLD' ? '🟢' : '🟡'}
            • Summary: ${techData.summary.overall_signal} (${techData.summary.confidence}%)
        `.trim();

        if (lstmData && lstmData.next_price > 0) {
            const lstmEmoji = lstmData.trend === 'BULLISH' ? '🟢' : lstmData.trend === 'BEARISH' ? '🔴' : '🟡';
            const priceChange = ((lstmData.next_price - coinData.usd) / coinData.usd * 100).toFixed(2);

            message += `\n\n🤖 <b>LSTM AI Prediction:</b>
                ${lstmEmoji} <b>Trend:</b> ${lstmData.trend}
                🎯 <b>Next Price:</b> $${lstmData.next_price.toFixed(2)} (${priceChange >= 0 ? '+' : ''}${priceChange}%)
                📊 <b>Confidence:</b> ${(lstmData.confidence * 100).toFixed(1)}%`;

            if (lstmData.support_resistance) {
                message += `
                🛡️ <b>Support:</b> $${lstmData.support_resistance.support.toFixed(2)}
                ⚡ <b>Resistance:</b> $${lstmData.support_resistance.resistance.toFixed(2)}`;
            }
        }
        if (alerts && alerts.length > 0) {
            message += '\n\n🚨 <b>Alerts:</b>';
            alerts.forEach(alert => {
                const alertEmoji = this.getAlertEmoji(alert.type, alert.severity);
                message += `\n${alertEmoji} ${alert.message}`;
                if (alert.recommendation) {
                    message += `\n   💡 ${alert.recommendation}`;
                }
            });
            setAlerts(alerts);
        }

        if (aiResult.analysis) {
            message += `\n\n🤖 <b>AI Analysis:</b>\n${aiResult.analysis}`;
        }

        if (aiResult.signals && aiResult.signals.length > 0) {
            message += '\n\n📊 <b>Trading Signals:</b>';
            aiResult.signals.forEach(signal => {
                const signalEmoji = signal.action === 'BUY' ? '🟢' : signal.action === 'SELL' ? '🔴' : '🟡';
                message += `\n${signalEmoji} <b>${signal.action}</b> (${(signal.confidence * 100).toFixed(0)}%)`;
                if (signal.entryPoint) message += `\n   🎯 Entry: $${signal.entryPoint}`;
                if (signal.stopLoss) message += `\n   🛑 Stop Loss: $${signal.stopLoss}`;
                if (signal.takeProfit) message += `\n   🎯 Take Profit: $${signal.takeProfit}`;
                if (signal.reasoning) message += `\n   💭 ${signal.reasoning}`;
            });
        }

        message += `\n\n⏰ <i>${new Date().toLocaleString('vi-VN')}</i>`;
        return message;
    }

    getAlertEmoji(type, severity) {
        const severityEmojis = {
            'CRITICAL': '🚨',
            'HIGH': '⚠️',
            'MEDIUM': '🟡',
            'LOW': 'ℹ️'
        };

        const typeEmojis = {
            'PRICE_CHANGE': '📈',
            'RSI_OVERBOUGHT': '🔴',
            'RSI_OVERSOLD': '🟢',
            'ENTRY_OPPORTUNITY': '🎯',
            'STOP_LOSS_ALERT': '🛑',
            'TAKE_PROFIT_ALERT': '💰',
            'SIGNAL_EXPIRY': '⏰'
        };

        return typeEmojis[type] || severityEmojis[severity] || '📊';
    }

    /**
     * Analyze and send alert
     * @param {string} symbol - Symbol coin
     * @param {boolean} forceAlert - Force alert sending
     */
    async analyzeAndAlert(symbol, forceAlert = false) {

        if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
            console.error('❌ Invalid symbol provided:', symbol);
            return {
                success: false,
                error: 'Valid symbol is required'
            };
        }

        symbol = symbol.trim().toLowerCase();
        console.log(`🔍 Starting analysis for: ${symbol}`);

        try {
            let lstmPredictions = null;

            try {
                // Try to get LSTM predictions
                const predictLSTM = (await import('../services/LSTMForecast.service.js')).default;
                lstmPredictions = await predictLSTM();
                console.log('✅ LSTM predictions loaded');
            } catch (error) {
                console.warn('⚠️ LSTM predictions failed, continuing without them:', error.message);
                // Create mock predictions to prevent errors
                lstmPredictions = {
                    btc: {
                        next_price: 0,
                        trend: 'NEUTRAL',
                        confidence: 0.5,
                        support: 0,
                        resistance: 0
                    },
                    eth: {
                        next_price: 0,
                        trend: 'NEUTRAL',
                        confidence: 0.5,
                        support: 0,
                        resistance: 0
                    }
                };
            }
            const lstmData = symbol === 'bitcoin' ? lstmPredictions.btc : lstmPredictions.eth;

            console.log(`📊 LSTM Prediction for ${symbol}:`, {
                nextPrice: lstmData.next_price,
                trend: lstmData.trend,
                confidence: lstmData.confidence
            });

            const [priceData, techData, newsData] = await Promise.all([
                binancePriceService.getCryptoPrices([symbol]),
                technicalIndicators.getTechnicalIndicators(symbol),
                this.getLatestNews()
            ]);

            if (!priceData || !priceData[symbol]) {
                throw new Error(`No price data available for ${symbol}`);
            }

            const currentPrice = priceData[symbol].usd;
            if (!currentPrice || isNaN(currentPrice)) {
                throw new Error(`Invalid price for ${symbol}: ${currentPrice}`);
            }

            const priceChange = lstmData.next_price > 0 ?
                ((lstmData.next_price - currentPrice) / currentPrice * 100).toFixed(2) :
                '0.00';

            const previousPrice = this.previousPrices[symbol];

            const alerts = this.alertSystem.checkAlerts(
                symbol,
                priceData[symbol],
                previousPrice ? {
                    usd: previousPrice
                } : null,
                techData
            );

            console.log(`📊 Alerts for ${symbol}: ${alerts.length}`);

            const analysisData = `
            Analyze ${symbol.toUpperCase()} market conditions:
            
            📊 CURRENT MARKET DATA:
            - Current Price: $${currentPrice.toFixed(2)}
            - 24h Change: ${priceData[symbol].usd_24h_change.toFixed(2)}%
            - 24h Volume: $${(priceData[symbol].usd_24h_vol / 1000000).toFixed(2)}M
            - Market Cap: $${(priceData[symbol].usd_market_cap / 1000000000).toFixed(2)}B
            
            🤖 LSTM AI PREDICTIONS:
            - Predicted Next Price: $${lstmData.next_price.toFixed(2)}
            - Expected Change: ${priceChange >= 0 ? '+' : ''}${priceChange}%
            - Trend: ${lstmData.trend}
            - Model Confidence: ${(lstmData.confidence * 100).toFixed(1)}%
            ${lstmData.support_resistance ? `- Support Level: $${lstmData.support_resistance.support.toFixed(2)}` : ''}
            ${lstmData.support_resistance ? `- Resistance Level: $${lstmData.support_resistance.resistance.toFixed(2)}` : ''}
            
            📈 TECHNICAL INDICATORS:
            - RSI: ${techData.rsi || 'N/A'}
            - MACD: ${techData.macd?.toFixed(2) || 'N/A'}
            - Technical Summary: ${techData.summary?.overall_signal || 'NEUTRAL'}
            - Signal Confidence: ${techData.summary?.confidence || 0}%
            
            📰 NEWS SENTIMENT:
            ${newsData ? `- Sentiment: ${newsData.sentiment || 'NEUTRAL'}
            - Impact: ${newsData.impact || 'LOW'}` : '- No recent news data available'}
            
            🚨 ACTIVE ALERTS:
            ${alerts.length > 0 ? alerts.map(a => `- ${a.type}: ${a.message}`).join('\n') : '- No active alerts'}
            
            IMPORTANT: Provide trading recommendation with:
            1. Action (BUY/SELL/HOLD)
            2. Confidence (0-1)
            3. Entry point
            4. Stop loss
            5. Take profit
            6. Reasoning (consider LSTM prediction, technical indicators, and news sentiment)
                    `.trim();

            const aiResult = await this.analyzeWithAI(analysisData);

            if (aiResult.signals && aiResult.signals.length > 0) {
                const tradingSignals = aiResult.signals.map(signal => ({
                    coin: symbol,
                    action: signal.action,
                    confidence: signal.confidence,
                    entryPoint: signal.entryPoint,
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.takeProfit,
                    timestamp: new Date(),
                    analysis: aiResult.analysis,
                    lstmPrediction: {
                        nextPrice: lstmData.next_price,
                        trend: lstmData.trend,
                        confidence: lstmData.confidence,
                        priceChange: parseFloat(priceChange)
                    },
                    technicalSignal: techData.summary?.overall_signal || 'NEUTRAL',
                    newsSentiment: newsData?.sentiment || 'NEUTRAL'
                }));

                this.alertSystem.setTradingSignals(tradingSignals);

                tradingSignals.forEach(signal => {
                    console.log(`📤 Emitting signal: ${signal.action} ${signal.coin} (${(signal.confidence * 100).toFixed(0)}%)`);
                    this.emit('tradingSignal', signal);
                });
            }

            const shouldAlert = forceAlert ||
                alerts.length > 0 ||
                (aiResult.signals && aiResult.signals.length > 0) ||
                Math.abs(priceData[symbol].usd_24h_change) > 5 || Math.abs(parseFloat(priceChange)) > 3;

            if (shouldAlert) {
                const alertMessage = this.formatAlertMessage(symbol, priceData, techData, aiResult, alerts, lstmData);
                await this.sendTelegramMessage(alertMessage);
                this.previousPrices[symbol] = currentPrice;

                console.log(`✅ Alert sent for ${symbol}`);
                return {
                    success: true,
                    message: 'Alert sent successfully',
                    alertCount: alerts.length,
                    signalCount: aiResult.signals?.length || 0,
                    analysis: aiResult.analysis,
                };
            } else {
                console.log(`ℹ️ No alert needed for ${symbol}`);
                return {
                    success: false,
                    message: 'No alert needed'
                };
            }
        } catch (error) {
            console.error(`❌ Error analyzing ${symbol}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getLatestNews() {
        if (this.orchestrator?.agents?.news) {
            return this.orchestrator.agents.news.newsCache.get('latest');
        }
        return null;
    }

    /**
     * Send Message Telegram
     * @param {string} message 
     * @param {string} chatId 
     */
    async sendTelegramMessage(message, chatId = process.env.TELEGRAM_CHAT_ID) {
        // Emit event instead of direct send
        this.emit('sendTelegramMessage', message);
    }

    /**
     * Get market status
     * @returns {Promise<Object>} - Market status
     */
    async getMarketStatus() {
        try {
            // ✅ Use Binance for instant response
            const marketData = await binancePriceService.getCryptoPrices(this.config.supportedCoins);

            const formatted = {};
            for (const [coin, data] of Object.entries(marketData)) {
                formatted[coin] = {
                    price: data.usd,
                    change24h: data.usd_24h_change,
                    volume: data.usd_24h_vol,
                    marketCap: data.usd_market_cap
                };
            }

            const activeSignals = this.alertSystem.getActiveSignals();

            return {
                success: true,
                data: formatted,
                activeSignals: activeSignals.length,
                signals: activeSignals
            };
        } catch (error) {
            console.error('❌ Error getting market status:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Setup scheduler
     */
    setupScheduler() {
        if (this.config.enableScheduler === false) {
            console.log('📅 Scheduler DISABLED (manual mode)');
            this.cronJobs = [];
            return;
        }

        console.log('📅 Setting up optimized scheduler...');

        // ✅ Reduced to 30 minutes (CoinGecko rate limit friendly)
        const mainJob = cron.schedule('*/30 * * * *', async () => {
            console.log('🔄 Scheduled analysis (30min interval)...');
            for (const coin of this.config.supportedCoins) {
                await this.analyzeAndAlert(coin);
                await new Promise(resolve => setTimeout(resolve, 75000)); // 75s between coins
            }
        });

        // ✅ Removed quick check to reduce API calls
        this.cronJobs = [mainJob];
        console.log('✅ Scheduler: 30min interval, no quick checks');
    }

    async start() {
        try {

            if (!this.config) {
                throw new Error('Configuration not initialized. Call init() first');
            }

            this.setupScheduler();

            await this.bot.launch();
            this.isRunning = true;

            console.log('🚀 AIAnalysisService started');

            await this.sendTelegramMessage('🤖 Crypto Alert Bot has started!');

            return {
                success: true,
                message: 'Service has started'
            };
        } catch (error) {
            console.error('❌ Error starting service:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async stop() {
        try {
            if (!this.isRunning) {
                console.log('⚠️ Service not running');
                return {
                    success: false,
                    message: 'Service not running'
                };
            }

            this.cronJobs.forEach(job => job.destroy());
            this.cronJobs = [];

            this.bot.stop();
            this.isRunning = false;

            console.log('🛑 AIAnalysisService stopped');
            return {
                success: true,
                message: 'Service stop'
            };
        } catch (error) {
            console.error('❌ Error stopping service:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config ? 'Configured' : 'Not configured',
            supportedCoins: this.config?.supportedCoins || [],
            cronJobs: this.cronJobs.length
        };
    }
}

export default new AIAnalysisAgent();