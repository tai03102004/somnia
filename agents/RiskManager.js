import EventEmitter from 'events';

class RiskManager extends EventEmitter {
    constructor() {
        super();
        this.riskLimits = {
            maxPositionSize: 0.1, // 10% of portfolio
            maxDailyLoss: 0.05, // 5% daily loss limit
            minConfidence: 0.7, // Minimum signal confidence
            maxOpenPositions: 3 // Maximum open positions
        };
        this.dailyPnL = 0;
        this.openPositions = 0;
        this.isRunning = false;
        this.config = null;

        this.peakEquity = 0; // Đỉnh cao nhất của tài khoản
        this.currentEquity = 0; // Giá trị hiện tại
        this.equityHistory = []; // Lịch sử equity
    }

    async start(config) {
        try {
            this.config = config;
            this.isRunning = true;

            console.log('🛡️ Risk Manager started');
            return {
                success: true
            };
        } catch (error) {
            console.error('❌ RiskManager start error:', error.message);
            this.isRunning = true; // Still mark as running
            return {
                success: false,
                error: error.message
            };
        }
    }

    handleEvent(eventName, data) {
        switch (eventName) {
            case 'validateSignal':
                this.validateSignal(data);
                break;
        }
    }

    async validateSignal(signal) {
        console.log(`🛡️ Validating signal: ${signal.action} ${signal.coin}`);

        const riskChecks = {
            confidence: this.checkConfidenceLevel(signal),
            positionLimit: this.checkPositionLimits(signal),
            dailyLoss: this.checkDailyLoss(),
            marketConditions: await this.checkMarketConditions(signal),
            volatility: this.checkVolatility(signal),
            correlation: await this.checkCorrelation(signal),
            drawdown: this.checkDrawdown()
        };

        const passed = Object.values(riskChecks).every(check => check);

        if (passed) {
            console.log('✅ Risk validation PASSED');
            this.emit('signalApproved', {
                ...signal,
                riskApproved: true,
                approvedAt: Date.now(),
                riskChecks
            });
        } else {
            const failedChecks = Object.entries(riskChecks)
                .filter(([_, passed]) => !passed)
                .map(([name]) => name);

            console.log(`❌ Risk validation FAILED: ${failedChecks.join(', ')}`);

            this.emit('signalRejected', {
                signal,
                reason: 'Risk management rejection',
                failedChecks
            });
        }
    }

    /**
     * Check market volatility using ATR (Average True Range)
     * High volatility = higher risk
     */
    async checkVolatility(signal) {
        try {
            // Get technical indicators for the coin
            const technicalData = await this.getTechnicalIndicators(signal.coin);

            if (!technicalData) {
                console.warn('⚠️ No technical data, allowing trade');
                return true;
            }

            // Check Bollinger Bands width (volatility indicator)
            if (technicalData.bollinger) {
                const bbWidth = technicalData.bollinger.upper - technicalData.bollinger.lower;
                const bbMiddle = technicalData.bollinger.middle;
                const bbWidthPercent = (bbWidth / bbMiddle) * 100;

                console.log(`📊 Bollinger Band Width: ${bbWidthPercent.toFixed(2)}%`);

                // If volatility > 10%, reject trade
                if (bbWidthPercent > 10) {
                    console.warn(`⚠️ VOLATILITY TOO HIGH: ${bbWidthPercent.toFixed(2)}% > 10%`);
                    return false;
                }
            }

            // Check ATR (Average True Range) if available
            if (technicalData.atr) {
                const atrPercent = (technicalData.atr / technicalData.currentPrice) * 100;

                console.log(`📊 ATR: ${atrPercent.toFixed(2)}%`);

                // If ATR > 5%, market is too volatile
                if (atrPercent > 5) {
                    console.warn(`⚠️ ATR TOO HIGH: ${atrPercent.toFixed(2)}% > 5%`);
                    return false;
                }
            }

            console.log('✅ Volatility check passed');
            return true;

        } catch (error) {
            console.error('❌ Volatility check error:', error.message);
            return true; // Default to allow if check fails
        }
    }

    /**
     * Helper: Get technical indicators
     */
    async getTechnicalIndicators(coin) {
        try {
            // Import technical analysis service
            const technicalIndicators = await import('../services/TechnicalAnalysis.service.js');
            return await technicalIndicators.default.getTechnicalIndicators(coin);
        } catch (error) {
            console.error('❌ Error fetching technical indicators:', error.message);
            return null;
        }
    }

    /**
     * Check portfolio correlation
     * Prevent opening correlated positions (e.g., all BTC & ETH long)
     */
    async checkCorrelation(signal) {
        try {
            // Get current portfolio from TradingAgent
            const tradingAgent = this.getTradingAgent();

            if (!tradingAgent || !tradingAgent.portfolio) {
                return true; // No portfolio to check
            }

            const portfolio = tradingAgent.portfolio;

            if (portfolio.size === 0) {
                console.log('✅ No existing positions, correlation check passed');
                return true;
            }

            // Count positions by direction
            let longPositions = 0;
            let shortPositions = 0;
            const positions = [];

            for (const [symbol, position] of portfolio) {
                positions.push({
                    symbol,
                    side: position.side
                });

                if (position.side === 'LONG' || position.side === 'BUY') {
                    longPositions++;
                } else {
                    shortPositions++;
                }
            }

            console.log(`📊 Portfolio: ${longPositions} LONG, ${shortPositions} SHORT`);

            // Check if new signal creates excessive correlation
            const newSide = signal.action.toUpperCase();

            // Rule 1: Don't allow 3+ positions in same direction
            if (newSide === 'BUY' && longPositions >= 2) {
                console.warn('⚠️ CORRELATION RISK: Too many LONG positions');
                return false;
            }

            if (newSide === 'SELL' && shortPositions >= 2) {
                console.warn('⚠️ CORRELATION RISK: Too many SHORT positions');
                return false;
            }

            // Rule 2: Check BTC-ETH correlation
            // If already have BTC long, limit ETH long (they're correlated)
            const hasBTCLong = Array.from(portfolio.values()).some(
                p => p.symbol.includes('BTC') && p.side === 'LONG'
            );
            const hasETHLong = Array.from(portfolio.values()).some(
                p => p.symbol.includes('ETH') && p.side === 'LONG'
            );

            if (signal.coin === 'ethereum' && newSide === 'BUY' && hasBTCLong) {
                console.warn('⚠️ BTC-ETH CORRELATION: Already have BTC long');
                // Allow but reduce position size (handled elsewhere)
            }

            console.log('✅ Correlation check passed');
            return true;

        } catch (error) {
            console.error('❌ Correlation check error:', error.message);
            return true; // Default to allow
        }
    }

    /**
     * Helper: Get TradingAgent reference
     */
    getTradingAgent() {
        // Access through orchestrator
        if (this.orchestrator && this.orchestrator.agents) {
            return this.orchestrator.agents.trading;
        }
        return null;
    }

    setOrchestrator(orchestrator) {
        this.orchestrator = orchestrator;
        console.log('🔗 Orchestrator reference set in RiskManager');
    }


    checkDrawdown() {
        const maxDrawdown = 0.15; // 15% max drawdown
        const currentDrawdown = this.calculateDrawdown();

        const passed = currentDrawdown < maxDrawdown;

        if (!passed) {
            console.warn(`⚠️ DRAWDOWN LIMIT EXCEEDED: ${(currentDrawdown * 100).toFixed(2)}% > ${(maxDrawdown * 100).toFixed(0)}%`);
        }

        return passed;
    }

    /**
     * Calculate maximum drawdown from peak
     * Drawdown = (Peak - Current) / Peak
     * Example: Peak $10,000 → Current $8,500 = 15% drawdown
     */
    calculateDrawdown() {
        if (this.peakEquity === 0) {
            return 0;
        }

        const drawdown = (this.peakEquity - this.currentEquity) / this.peakEquity;

        console.log(`📉 Current Drawdown: ${(drawdown * 100).toFixed(2)}% (Peak: $${this.peakEquity.toFixed(2)}, Current: $${this.currentEquity.toFixed(2)})`);

        return Math.max(0, drawdown);
    }

    checkConfidenceLevel(signal) {
        return signal.confidence >= this.riskLimits.minConfidence;
    }

    checkPositionLimits(signal) {
        return this.openPositions < this.riskLimits.maxOpenPositions;
    }

    checkDailyLoss() {
        return this.dailyPnL > -this.riskLimits.maxDailyLoss;
    }

    /**
     * Check overall market conditions
     * - Market sentiment (from NewsAgent)
     * - Trading volume
     * - Market trend
     */
    async checkMarketConditions(signal) {
        try {
            console.log('🌤️ Checking market conditions...');

            const checks = {
                sentiment: true,
                volume: true,
                trend: true
            };

            // 1. Check news sentiment
            if (this.orchestrator?.agents?.news) {
                const newsData = this.orchestrator.agents.news.newsCache.get('latest');

                if (newsData) {
                    const {
                        sentiment,
                        score,
                        impact
                    } = newsData;

                    console.log(`📰 News Sentiment: ${sentiment} (${score.toFixed(2)}) - Impact: ${impact}`);

                    // If sentiment is very bearish and trying to BUY, warn
                    if (sentiment === 'BEARISH' && score < 0.3 && signal.action === 'BUY') {
                        console.warn('⚠️ Bearish sentiment conflicts with BUY signal');
                        checks.sentiment = false;
                    }

                    // If sentiment is very bullish and trying to SELL, warn
                    if (sentiment === 'BULLISH' && score > 0.7 && signal.action === 'SELL') {
                        console.warn('⚠️ Bullish sentiment conflicts with SELL signal');
                        checks.sentiment = false;
                    }
                }
            }

            // 2. Check trading volume (from MarketAgent)
            if (this.orchestrator?.agents?.market) {
                const symbol = signal.coin === 'bitcoin' ? 'BTCUSDT' : 'ETHUSDT';
                const priceData = this.orchestrator.agents.market.priceCache.get(symbol);

                if (priceData && priceData.volume) {
                    const volume = priceData.volume;

                    // Check if volume is too low (< 100M for BTC, < 50M for ETH)
                    const minVolume = signal.coin === 'bitcoin' ? 100000000 : 50000000;

                    if (volume < minVolume) {
                        console.warn(`⚠️ Low trading volume: ${(volume / 1000000).toFixed(2)}M`);
                        checks.volume = false;
                    } else {
                        console.log(`✅ Volume OK: ${(volume / 1000000).toFixed(2)}M`);
                    }
                }
            }

            // 3. Check overall market trend
            const techData = await this.getTechnicalIndicators(signal.coin);
            if (techData && techData.summary) {
                const {
                    overall_signal,
                    confidence
                } = techData.summary;

                console.log(`📊 Market Trend: ${overall_signal} (${confidence}%)`);

                // If technical analysis contradicts signal, warn
                if (overall_signal === 'SELL' && signal.action === 'BUY' && confidence > 70) {
                    console.warn('⚠️ Technical analysis suggests SELL, but signal is BUY');
                    checks.trend = false;
                }

                if (overall_signal === 'BUY' && signal.action === 'SELL' && confidence > 70) {
                    console.warn('⚠️ Technical analysis suggests BUY, but signal is SELL');
                    checks.trend = false;
                }
            }

            // Require at least 2 out of 3 checks to pass
            const passedChecks = Object.values(checks).filter(v => v).length;
            const passed = passedChecks >= 2;

            if (!passed) {
                console.warn(`⚠️ Market conditions unfavorable: ${passedChecks}/3 checks passed`);
            } else {
                console.log(`✅ Market conditions favorable: ${passedChecks}/3 checks passed`);
            }

            return passed;

        } catch (error) {
            console.error('❌ Market conditions check error:', error.message);
            return true; // Default to allow
        }
    }

    /**
     * Update equity and track peak
     * Call this after every trade
     */
    async updateEquity(tradingAgent) {
        try {
            // Get current balance from trading agent
            const balance = await tradingAgent.binanceLive.getAccountBalance();

            if (!balance || !balance.USDT) {
                console.warn('⚠️ Cannot update equity - balance unavailable');
                return;
            }

            // Calculate total equity (balance + unrealized P&L)
            let totalEquity = parseFloat(balance.USDT.free) + parseFloat(balance.USDT.locked || 0);

            // Add unrealized P&L from open positions
            if (tradingAgent.portfolio && tradingAgent.portfolio.size > 0) {
                for (const [symbol, position] of tradingAgent.portfolio) {
                    if (position.unrealizedPnL) {
                        totalEquity += position.unrealizedPnL.absolute || 0;
                    }
                }
            }

            this.currentEquity = totalEquity;

            // Update peak if current is higher
            if (totalEquity > this.peakEquity) {
                this.peakEquity = totalEquity;
                console.log(`🎉 NEW EQUITY PEAK: $${this.peakEquity.toFixed(2)}`);
            }

            // Store in history (keep last 100 records)
            this.equityHistory.push({
                timestamp: Date.now(),
                equity: totalEquity,
                peak: this.peakEquity
            });

            if (this.equityHistory.length > 100) {
                this.equityHistory.shift();
            }

            const drawdown = this.calculateDrawdown();

            // Alert if drawdown is significant
            if (drawdown > 0.10) {
                console.warn(`⚠️ SIGNIFICANT DRAWDOWN: ${(drawdown * 100).toFixed(2)}%`);
            }

        } catch (error) {
            console.error('❌ Error updating equity:', error.message);
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            dailyPnL: this.dailyPnL,
            openPositions: this.openPositions,
            riskLimits: this.riskLimits
        };
    }

    stop() {
        this.isRunning = false;
        console.log('🛡️ Risk Manager stopped');
    }
}

export default RiskManager;