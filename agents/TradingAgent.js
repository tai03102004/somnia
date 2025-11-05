import BinanceLiveTrading from '../services/BinanceService.service.js';
import blockchainConnector from '../services/BlockchainConnector.service.js';
import {
    EventEmitter
} from 'events';

class TradingAgent extends EventEmitter {
    constructor() {
        super();
        this.portfolio = new Map(); // Live positions
        this.orderHistory = [];
        this.balance = {};
        this.tradingMode = 'live';
        this.autoTradingEnabled = false;
        this.binanceLive = BinanceLiveTrading;
        this.isRunning = false;

        this.autoTradingConfig = {
            minConfidence: 0.75,
            maxPositions: 3,
            positionSizePercent: 0.01, // 1% per trade
            stopLossPercent: 0.03, // 3% stop loss
            takeProfitPercent: 0.05, // 5% take profit
            cooldownMinutes: 15 // Wait 15 minutes between trades on same symbol
        };

        this.lastTradeTime = new Map();

        // ✨ Trading stats for P&L tracking
        this.tradingStats = {
            totalTrades: 0,
            winTrades: 0,
            lossTrades: 0,
            totalPnL: 0,
            dailyPnL: 0
        };

        this.priceMonitor = null;
        this.blockchainConnector = blockchainConnector;
    }

    async start(config) {
        try {
            this.config = config;
            this.tradingMode = config?.tradingMode || 'live';
            this.isRunning = true;

            console.log(`🚀 Starting TradingAgent in ${this.tradingMode} mode...`);

            if (this.tradingMode === 'live' && this.binanceLive) {
                try {
                    const testResult = await this.binanceLive.testConnection();
                    if (!testResult.success) {
                        console.warn('⚠️ Binance connection failed, staying in live mode');
                    } else {
                        const connected = await this.binanceLive.initialize();
                        if (connected) {
                            this.balance = await this.binanceLive.getAccountBalance();
                            console.log(`💰 Live Trading connected - Balance: ${this.balance.USDT.free} USDT`);
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Binance init error: ${error.message}`);
                }
            }

            // Start P&L monitoring for live mode
            if (this.tradingMode === 'live') {
                this.startPnLMonitoring();
            }

            console.log(`✅ TradingAgent started successfully`);
            return {
                success: true
            };

        } catch (error) {
            console.error('❌ TradingAgent start error:', error.message);
            this.isRunning = true; // Still mark as running
            return {
                success: false,
                error: error.message
            };
        }
    }

    async handleAutoTradingSignal(signal) {
        if (!this.autoTradingEnabled) {
            console.log('🤖 Auto trading disabled, skipping signal');
            return {
                success: false,
                reason: 'Auto trading disabled'
            };
        }

        // Check cooldown
        const symbol = this.convertCoinToSymbol(signal.coin);
        const lastTrade = this.lastTradeTime.get(symbol);
        const cooldownMs = this.autoTradingConfig.cooldownMinutes * 60 * 1000;

        if (lastTrade && (Date.now() - lastTrade) < cooldownMs) {
            console.log(`⏰ Cooldown active for ${symbol}, skipping signal`);
            return {
                success: false,
                reason: 'Cooldown active'
            };
        }

        // Check confidence threshold
        if (signal.confidence < this.autoTradingConfig.minConfidence) {
            console.log(`📊 Signal confidence ${signal.confidence} below threshold ${this.autoTradingConfig.minConfidence}`);
            return {
                success: false,
                reason: 'Confidence too low'
            };
        }

        // Check max positions
        if (this.portfolio.size >= this.autoTradingConfig.maxPositions) {
            console.log(`📊 Max positions (${this.autoTradingConfig.maxPositions}) reached`);
            return {
                success: false,
                reason: 'Max positions reached'
            };
        }

        console.log(`🤖 AUTO TRADING: Executing signal for ${signal.coin.toUpperCase()}`);

        // Execute the signal
        const result = await this.executeSignal(signal);

        if (result.success) {
            this.lastTradeTime.set(symbol, Date.now());
        }

        return result;
    }

    validateSignal(signal) {
        if (!signal.coin || !signal.action || !signal.confidence) {
            console.log('❌ Invalid signal format');
            return false;
        }

        if (this.autoTradingEnabled) {
            // Stricter validation for auto trading
            if (signal.confidence < this.autoTradingConfig.minConfidence) {
                console.log(`❌ Confidence ${signal.confidence} below auto trading threshold`);
                return false;
            }

            if (this.portfolio.size >= this.autoTradingConfig.maxPositions) {
                console.log(`❌ Max positions reached: ${this.portfolio.size}/${this.autoTradingConfig.maxPositions}`);
                return false;
            }
        } else {
            // Manual trading - more relaxed validation
            if (signal.confidence < 0.5) {
                console.log(`❌ Manual trade confidence too low: ${signal.confidence}`);
                return false;
            }
        }

        // Check balance
        if (this.balance.USDT && this.balance.USDT.free < 10) {
            console.log(`❌ Insufficient balance: ${this.balance.USDT.free} USDT`);
            return false;
        }

        return true;
    }

    calculatePositionSize(signal) {
        const accountValue = this.balance?.USDT?.free || 0;

        if (this.autoTradingEnabled) {
            // Use configured percentage for auto trading
            const autoTradeValue = accountValue * this.autoTradingConfig.positionSizePercent;
            console.log(`🤖 Auto trading position size: ${autoTradeValue} (${this.autoTradingConfig.positionSizePercent * 100}% of ${accountValue})`);
            return autoTradeValue;
        } else {
            // Manual trading - more flexible sizing
            const riskPercentage = 0.02;
            const maxTradeValue = accountValue * 0.05; // Up to 5% for manual trades

            if (signal.stopLoss && signal.entryPoint) {
                const riskPerUnit = Math.abs(signal.entryPoint - signal.stopLoss);
                const riskAmount = accountValue * riskPercentage;
                const quantity = riskAmount / riskPerUnit;
                return Math.min(quantity * signal.entryPoint, maxTradeValue);
            }

            return accountValue * 0.02; // 2% default for manual
        }
    }

    getAutoTradingStatus() {
        return {
            enabled: this.autoTradingEnabled,
            mode: this.tradingMode,
            config: this.autoTradingConfig,
            activePositions: this.portfolio.size,
            maxPositions: this.autoTradingConfig.maxPositions,
            lastTradeTime: Object.fromEntries(this.lastTradeTime)
        };
    }

    updateAutoTradingConfig(config) {
        this.autoTradingConfig = {
            ...this.autoTradingConfig,
            ...config
        };
        console.log('🔧 Auto trading config updated:', this.autoTradingConfig);
    }

    // ✨ Main execution method
    async executeSignal(signal) {
        // try {

        if (this.tradingMode === 'live' && this.binanceLive.exchange) {
            console.log('💰 Updating balance before trade...');
            this.balance = await this.binanceLive.getAccountBalance();
            console.log('✅ Updated balance:', this.balance);
        }

        if (!this.validateSignal(signal)) {
            return {
                success: false,
                error: 'Signal validation failed'
            };
        }

        const symbol = this.convertCoinToSymbol(signal.coin);
        const side = signal.action.toLowerCase();
        const amount = this.calculatePositionSize(signal);
        console.log("💰 Calculated trade amount:", amount);
        console.log(`🔍 Trading ${side.toUpperCase()} ${symbol} with amount: $${amount}`);

        if (!amount || amount <= 0) {
            console.error('❌ Invalid amount:', amount);
            // ✨ FORCE MINIMUM TRADE IF BALANCE IS GOOD
            if (this.balance?.USDT > 100) {
                const forceAmount = 50; // Force $50 trade
                console.log(`🔧 Forcing minimum trade: $${forceAmount}`);
                return await this.executeLiveOrder(symbol, side, forceAmount, signal);
            }
            return {
                success: false,
                error: 'Invalid trade amount'
            };
        }


        if (this.tradingMode === 'live') {
            return await this.executeLiveOrder(symbol, side, amount, signal);
        } else {
            return await this.executePaperTrade(symbol, side, amount, signal);
        }
        // } catch (error) {
        //     console.error('❌ Trade execution error:', error);
        //     return {
        //         success: false,
        //         error: error.message
        //     };
        // }
    }

    validateSignal(signal) {
        if (!signal.coin || !signal.action || !signal.confidence) return false;
        if (signal.confidence < 0.75) return false;
        if (this.balance.USDT < 10) return false;
        if (this.portfolio.size >= 3) return false;
        return true;
    }

    // ✨ LIVE BINANCE TRADING
    async executeLiveOrder(symbol, side, amount, signal) {
        try {
            console.log(`🚀 LIVE TRADE: ${side.toUpperCase()} ${symbol} - $${amount}`);
            const preTradeBalance = await this.binanceLive.getAccountBalance();
            console.log(`💰 Pre-trade USDT: ${preTradeBalance.USDT.free}`);

            console.log(`🚀 LIVE TRADE: ${side.toUpperCase()} ${symbol} - $${amount}`);

            const result = await this.binanceLive.createMarketOrder(symbol, side, amount);

            if (!result || !result.success) {
                throw new Error(result?.error || 'Order failed');
            }

            const order = {
                id: result.orderId,
                symbol: symbol,
                side: side.toUpperCase(),
                amount: amount,
                price: result.price || 0,
                timestamp: Date.now(),
                mode: 'LIVE',

                // ✅ Add execution details
                executionTime: result.executionTime || 0,
                commission: result.commission || 0,

                // ✅ Add signal details
                signalConfidence: signal.confidence || 0,
                entryPoint: signal.entryPoint || result.price,
                stopLoss: signal.stopLoss || 0,
                takeProfit: signal.takeProfit || 0,
                reasoning: signal.reasoning || '',

                // ✅ Add LSTM prediction
                lstmPrediction: signal.lstmPrediction ? {
                    nextPrice: signal.lstmPrediction.nextPrice,
                    trend: signal.lstmPrediction.trend,
                    confidence: signal.lstmPrediction.confidence
                } : null,

                txHash: null,

                pnl: null,
                pnlPercentage: null,
                exitPrice: null,
                exitTime: null,
                status: side === 'buy' ? 'OPEN' : 'CLOSED'
            };

            this.orderHistory.push(order);
            this.tradingStats.totalTrades++;
            try {
                const txHash = await this.blockchainConnector.executeTrade({
                    symbol: symbol,
                    side: side,
                    amount: amount,
                    price: result.price,
                    timestamp: Date.now()
                });

                // Update order with txHash
                order.txHash = txHash;
                console.log(`✅ Trade recorded on blockchain: ${txHash}`);
            } catch (error) {
                console.warn('⚠️ Blockchain recording failed:', error.message);
            }

            if (side === 'buy') {
                const position = {
                    symbol: symbol,
                    side: 'LONG',
                    entryPrice: signal.entryPoint || result.price,
                    quantity: amount,
                    entryTime: new Date(),
                    stopLoss: signal.stopLoss || (result.price * 0.97),
                    takeProfit: signal.takeProfit || (result.price * 1.05),
                    currentPrice: result.price,
                    unrealizedPnL: {
                        absolute: 0,
                        percentage: 0
                    },
                    signalConfidence: signal.confidence,
                    lstmPrediction: signal.lstmPrediction,
                    orderId: result.orderId
                };

                this.portfolio.set(symbol, position);
            } else {
                const position = this.portfolio.get(symbol);

                if (position) {
                    const pnl = this.calculatePnL(position, result.price);

                    // Update order with P&L
                    order.pnl = pnl.absolute;
                    order.pnlPercentage = pnl.percentage;
                    order.exitPrice = result.price;
                    order.exitTime = Date.now();

                    // Update stats
                    this.updateTradingStats(pnl.absolute);

                    // Remove from portfolio
                    this.portfolio.delete(symbol);

                    // Send P&L notification
                    await this.sendPnLNotification(symbol, position, result.price, pnl);
                }
            }

            this.emit('orderExecuted', order);
            return {
                success: true,
                order
            };

        } catch (error) {
            console.error('❌ Live order failed:', error.message);
            const failureMessage = `❌ <b>TRADE FAILED</b>\n\n` +
                `🪙 ${symbol}\n` +
                `🎯 ${side.toUpperCase()}\n` +
                `💰 Amount: $${amount.toFixed(2)}\n` +
                `📛 Error: ${error.message}`;

            this.emit('sendTelegramMessage', failureMessage);

            return {
                success: false,
                error: error.message
            };
        }
    }

    // ✨ Paper trading (for testing)
    async executePaperTrade(symbol, side, amount, signal) {
        try {
            const currentPrice = signal.entryPoint || 50000;
            const quantity = amount / currentPrice;

            const order = {
                id: `paper_${Date.now()}`,
                symbol: symbol,
                side: side.toUpperCase(),
                quantity: quantity,
                price: currentPrice,
                timestamp: Date.now(),
                mode: 'PAPER',
                signal: signal
            };

            this.orderHistory.push(order);

            if (side === 'buy') {
                this.balance.USDT -= amount;
                this.portfolio.set(symbol, {
                    symbol: symbol,
                    entryPrice: currentPrice,
                    quantity: quantity,
                    entryTime: new Date(),
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.takeProfit
                });
            } else {
                const position = this.portfolio.get(symbol);
                console.log("💰 Closing position:", position);
                if (position) {
                    const pnl = this.calculatePnL(position, currentPrice);
                    this.updateTradingStats(pnl);
                    this.balance.USDT += amount;
                    this.portfolio.delete(symbol);
                    await this.sendPnLNotification(symbol, position, currentPrice, pnl);
                }
            }

            console.log(`✅ Paper trade: ${side.toUpperCase()} ${symbol} @ $${currentPrice}`);
            this.emit('orderExecuted', order);
            return {
                success: true,
                order
            };

        } catch (error) {
            console.error('❌ Paper trade failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ✨ P&L calculation
    calculatePnL(position, exitPrice) {
        const pnl = (exitPrice - position.entryPrice) * position.quantity;
        const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

        return {
            absolute: pnl,
            percentage: pnlPercent,
            isProfit: pnl > 0
        };
    }

    updateTradingStats(pnl) {
        this.tradingStats.totalPnL += pnl.absolute;
        this.tradingStats.dailyPnL += pnl.absolute;

        if (pnl.isProfit) {
            this.tradingStats.winTrades++;
        } else {
            this.tradingStats.lossTrades++;
        }
    }

    // ✨ Real-time monitoring for live trading
    startPnLMonitoring() {
        this.priceMonitor = setInterval(async () => {
            if (this.portfolio.size > 0) {
                await this.updatePortfolioPrices();
                await this.checkStopLossAndTakeProfit();
            }
        }, 30000);
    }

    async updatePortfolioPrices() {
        try {
            for (const [symbol, position] of this.portfolio) {
                const ticker = await this.binanceLive.exchange.fetchTicker(symbol);
                position.currentPrice = ticker.last;
                position.unrealizedPnL = this.calculatePnL(position, ticker.last);
                this.portfolio.set(symbol, position);
            }
        } catch (error) {
            console.error('❌ Price update failed:', error.message);
        }
    }

    // Add to TradingAgent class:

    async checkStopLossAndTakeProfit() {
        for (const [symbol, position] of this.portfolio) {
            const currentPrice = position.currentPrice;

            // ✨ Smart Stop Loss (Market conditions)
            if (position.stopLoss && currentPrice <= position.stopLoss) {
                console.log(`🛑 STOP LOSS TRIGGERED: ${symbol} @ $${currentPrice}`);
                await this.executeLiveOrder(symbol, 'sell', position.quantity, {
                    type: 'stop_loss',
                    reason: `Stop loss hit at $${currentPrice}`
                });
            }

            // ✨ Smart Take Profit  
            if (position.takeProfit && currentPrice >= position.takeProfit) {
                console.log(`🎯 TAKE PROFIT TRIGGERED: ${symbol} @ $${currentPrice}`);
                await this.executeLiveOrder(symbol, 'sell', position.quantity, {
                    type: 'take_profit',
                    reason: `Take profit hit at $${currentPrice}`
                });
            }

            // ✨ Emergency Exit (Market crash detection)
            if (position.unrealizedPnL && position.unrealizedPnL.percentage < -10) {
                console.log(`🚨 EMERGENCY EXIT: ${symbol} - Loss > 10%`);
                await this.executeLiveOrder(symbol, 'sell', position.quantity, {
                    type: 'emergency_exit',
                    reason: `Emergency exit - Loss: ${position.unrealizedPnL.percentage.toFixed(2)}%`
                });
            }

            // ✨ Trailing Stop (Lock in profits)
            if (position.unrealizedPnL && position.unrealizedPnL.percentage > 5) {
                const trailingStop = currentPrice * 0.95; // 5% trailing stop
                if (trailingStop > position.stopLoss) {
                    position.stopLoss = trailingStop;
                    console.log(`📈 TRAILING STOP updated: ${symbol} @ $${trailingStop.toFixed(2)}`);
                }
            }
        }
    }

    // ✨ Enhanced P&L notification with more details
    async sendPnLNotification(symbol, position, exitPrice, pnl) {
        const emoji = pnl.isProfit ? '🟢' : '🔴';
        const status = pnl.isProfit ? 'PROFIT' : 'LOSS';

        // Determine exit reason
        let exitReason = '🔄 Manual';
        if (position.signal?.type === 'stop_loss') exitReason = '🛑 Stop Loss';
        if (position.signal?.type === 'take_profit') exitReason = '🎯 Take Profit';
        if (position.signal?.type === 'emergency_exit') exitReason = '🚨 Emergency';

        const message = `${emoji} <b>${status} - ${symbol}</b>\n\n` +
            `📈 <b>Entry:</b> $${position.entryPrice.toFixed(2)}\n` +
            `📉 <b>Exit:</b> $${exitPrice.toFixed(2)}\n` +
            `💰 <b>P&L:</b> $${pnl.absolute.toFixed(2)} (${pnl.percentage.toFixed(2)}%)\n` +
            `📊 <b>Quantity:</b> ${position.quantity.toFixed(6)}\n` +
            `⏰ <b>Duration:</b> ${this.getPositionDuration(position.entryTime)}\n` +
            `🏷️ <b>Exit Type:</b> ${exitReason}\n\n` +
            `📈 <b>Total P&L:</b> $${this.tradingStats.totalPnL.toFixed(2)}\n` +
            `🎯 <b>Win Rate:</b> ${this.getWinRate()}%\n` +
            `📊 <b>Total Trades:</b> ${this.tradingStats.totalTrades}`;

        this.emit('sendTelegramMessage', message);
    }

    getPositionDuration(entryTime) {
        const duration = Date.now() - entryTime.getTime();
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    getWinRate() {
        const totalClosedTrades = this.tradingStats.winTrades + this.tradingStats.lossTrades;
        if (totalClosedTrades === 0) return 0;
        return ((this.tradingStats.winTrades / totalClosedTrades) * 100).toFixed(1);
    }

    getPortfolioStatus() {
        const positions = [];
        let totalUnrealizedPnL = 0;
        let totalRealizedPnL = this.tradingStats.totalPnL || 0;

        // Convert Map to Array with detailed info
        for (const [symbol, position] of this.portfolio) {
            const positionData = {
                symbol: symbol,
                side: position.side,
                quantity: position.quantity,
                entryPrice: position.entryPrice,
                currentPrice: position.currentPrice || position.entryPrice,
                entryTime: position.entryTime,
                stopLoss: position.stopLoss,
                takeProfit: position.takeProfit,
                unrealizedPnL: position.unrealizedPnL || {
                    absolute: 0,
                    percentage: 0
                },
                // ✅ Add more details
                durationMinutes: position.entryTime ?
                    Math.floor((Date.now() - new Date(position.entryTime).getTime()) / 60000) : 0,
                signalConfidence: position.signalConfidence || 0,
                lstmPrediction: position.lstmPrediction || null
            };

            positions.push(positionData);
            totalUnrealizedPnL += positionData.unrealizedPnL.absolute;
        }

        // Calculate comprehensive stats
        const winRate = this.getWinRate();
        const avgWin = this.tradingStats.winTrades > 0 ?
            this.tradingStats.totalPnL / this.tradingStats.winTrades :
            0;
        const avgLoss = this.tradingStats.lossTrades > 0 ?
            Math.abs(this.tradingStats.totalPnL / this.tradingStats.lossTrades) :
            0;

        return {
            // Positions
            positions: positions,
            openPositions: this.portfolio.size,

            // P&L
            totalRealizedPnL: totalRealizedPnL,
            totalUnrealizedPnL: totalUnrealizedPnL,
            totalPnL: totalRealizedPnL + totalUnrealizedPnL,
            dailyPnL: this.tradingStats.dailyPnL || 0,

            // Stats
            totalTrades: this.tradingStats.totalTrades || 0,
            winTrades: this.tradingStats.winTrades || 0,
            lossTrades: this.tradingStats.lossTrades || 0,
            winRate: winRate,
            avgWin: avgWin,
            avgLoss: avgLoss,
            profitFactor: avgLoss > 0 ? (avgWin / avgLoss) : 0,

            // Balance
            balance: this.balance,

            // Mode
            tradingMode: this.tradingMode,

            // Timestamp
            lastUpdated: Date.now()
        };
    }

    convertCoinToSymbol(coin) {
        const mapping = {
            'bitcoin': 'BTCUSDT',
            'ethereum': 'ETHUSDT'
        };
        return mapping[coin] || `${coin.toUpperCase()}USDT`;
    }

    calculatePositionSize(signal) {
        const riskPercentage = 0.02;
        const accountValue = this.balance?.USDT.free || 0;
        const maxTradeValue = accountValue * 0.01;
        console.log(`💰 Account USDT: ${accountValue}`);
        console.log(`📊 Max trade value: ${maxTradeValue}`);
        if (signal.stopLoss && signal.entryPoint) {
            const riskPerUnit = Math.abs(signal.entryPoint - signal.stopLoss);
            const riskAmount = accountValue * riskPercentage;
            const quantity = riskAmount / riskPerUnit;
            return Math.min(quantity * signal.entryPoint, maxTradeValue);
        }

        return accountValue * 0.01;
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            tradingMode: this.tradingMode,
            balance: this.balance,
            activePositions: this.portfolio.size,
            totalTrades: this.orderHistory.length
        };
    }

    async stop() {
        this.isRunning = false;
        if (this.priceMonitor) {
            clearInterval(this.priceMonitor);
        }
        console.log('🛑 Trading Agent stopped');
    }
}

export default TradingAgent;