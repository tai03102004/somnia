import {
    Telegraf
} from 'telegraf';
import EventEmitter from 'events';

/**
 * Telegram Bot Service Class
 */
class TelegramBotService extends EventEmitter {
    constructor() {
        super();
        this.bot = null;
        this.isRunning = false;
        this.config = null;
        this.analysisAgent = null;
        this.orchestrator = null;
    }

    /**
     * Initialize Telegram Bot
     * @param {Object} config - Configuration
     * @param {Object} analysisAgent - Reference to AnalysisAgent
     * @param {Object} orchestrator - Reference to Orchestrator
     */
    init(config, analysisAgent, orchestrator) {
        this.config = config;
        this.analysisAgent = analysisAgent;
        this.orchestrator = orchestrator;

        this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

        this.setupCommands();

        console.log('✅ Telegram Bot Service initialized');
        return this;
    }

    /**
     * Setup all Telegram commands
     */
    setupCommands() {
        this.bot.command('start', (ctx) => {
            ctx.reply('🚀 Crypto Alert Bot is ready!\n\n/help - See instructions');
        });

        this.bot.command('status', async (ctx) => {
            try {
                const result = await this.analysisAgent.getMarketStatus();
                if (result.success) {
                    let message = '📊 <b>Market Status:</b>\n\n';
                    Object.entries(result.data).forEach(([coin, data]) => {
                        const emoji = coin === 'bitcoin' ? '🟡' : '🔵';
                        const name = coin === 'bitcoin' ? 'Bitcoin' : 'Ethereum';
                        message += `${emoji} <b>${name}:</b> $${data.price.toFixed(2)} (${data.change24h.toFixed(2)}%)\n`;
                    });

                    if (result.activeSignals > 0) {
                        message += `\n📊 <b>Active Trading Signals:</b> ${result.activeSignals}`;
                    }

                    ctx.reply(message, {
                        parse_mode: 'HTML'
                    });
                } else {
                    ctx.reply('❌ Error getting market data');
                }
            } catch (error) {
                ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('signals', (ctx) => {
            try {
                const activeSignals = this.analysisAgent.alertSystem.getActiveSignals();

                if (activeSignals.length === 0) {
                    ctx.reply('📊 No active trading signals');
                    return;
                }

                let message = '📊 <b>Active Trading Signals:</b>\n\n';
                activeSignals.forEach(signal => {
                    const emoji = signal.action === 'BUY' ? '🟢' : signal.action === 'SELL' ? '🔴' : '🟡';
                    message += `${emoji} <b>${signal.coin.toUpperCase()}</b> - ${signal.action}\n`;
                    if (signal.entryPoint) message += `   🎯 Entry: $${signal.entryPoint}\n`;
                    if (signal.stopLoss) message += `   🛑 Stop: $${signal.stopLoss}\n`;
                    if (signal.takeProfit) message += `   💰 Target: $${signal.takeProfit}\n`;
                    if (signal.reasoning) message += `   💭 ${signal.reasoning}\n`;
                    message += `   ⏰ ${new Date(signal.createdAt).toLocaleString('vi-VN')}\n\n`;
                });

                ctx.reply(message, {
                    parse_mode: 'HTML'
                });
            } catch (error) {
                ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('portfolio', async (ctx) => {
            try {
                if (!this.orchestrator?.agents?.trading) {
                    ctx.reply('❌ Trading agent not available');
                    return;
                }

                const portfolio = this.orchestrator.agents.trading.getPortfolioStatus();

                let message = `📊 <b>PORTFOLIO STATUS</b>\n\n`;
                message += `💰 <b>Realized P&L:</b> $${portfolio.totalRealizedPnL.toFixed(2)}\n`;
                message += `💹 <b>Unrealized P&L:</b> $${portfolio.totalUnrealizedPnL.toFixed(2)}\n`;
                message += `🎯 <b>Win Rate:</b> ${portfolio.winRate}%\n`;
                message += `📊 <b>Total Trades:</b> ${portfolio.totalTrades}\n\n`;

                if (portfolio.positions.length > 0) {
                    message += `🔄 <b>OPEN POSITIONS (${portfolio.positions.length}):</b>\n`;
                    portfolio.positions.forEach(pos => {
                        const pnl = pos.unrealizedPnL;
                        const emoji = pnl && pnl.isProfit ? '🟢' : '🔴';
                        message += `${emoji} ${pos.symbol}: $${pos.currentPrice.toFixed(2)} `;
                        if (pnl) {
                            message += `(${pnl.percentage.toFixed(2)}%)\n`;
                        } else {
                            message += '\n';
                        }
                    });
                } else {
                    message += `📭 <i>No open positions</i>`;
                }

                ctx.reply(message, {
                    parse_mode: 'HTML'
                });
            } catch (error) {
                ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('pnl', async (ctx) => {
            try {
                if (!this.orchestrator?.agents?.trading) {
                    ctx.reply('❌ Trading agent not available');
                    return;
                }

                const portfolio = this.orchestrator.agents.trading.getPortfolioStatus();
                const stats = this.orchestrator.agents.trading.tradingStats;

                const message = `📈 <b>P&L SUMMARY</b>\n\n` +
                    `💰 <b>Total P&L:</b> $${portfolio.totalRealizedPnL.toFixed(2)}\n` +
                    `📅 <b>Today's P&L:</b> $${stats.dailyPnL.toFixed(2)}\n` +
                    `💹 <b>Unrealized P&L:</b> $${portfolio.totalUnrealizedPnL.toFixed(2)}\n\n` +
                    `✅ <b>Winning Trades:</b> ${stats.winTrades}\n` +
                    `❌ <b>Losing Trades:</b> ${stats.lossTrades}\n` +
                    `🎯 <b>Win Rate:</b> ${portfolio.winRate}%\n` +
                    `📊 <b>Total Trades:</b> ${stats.totalTrades}`;

                ctx.reply(message, {
                    parse_mode: 'HTML'
                });
            } catch (error) {
                ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('trades', async (ctx) => {
            try {
                if (!this.orchestrator?.agents?.trading) {
                    ctx.reply('❌ Trading agent not available');
                    return;
                }

                const history = this.orchestrator.agents.trading.orderHistory.slice(-10);

                if (history.length === 0) {
                    ctx.reply('📭 No recent trades');
                    return;
                }

                let message = `📊 <b>RECENT TRADES (${history.length})</b>\n\n`;

                history.forEach(trade => {
                    const emoji = trade.side === 'BUY' ? '🟢' : '🔴';
                    const time = new Date(trade.timestamp).toLocaleString();
                    message += `${emoji} <b>${trade.side}</b> ${trade.symbol}\n`;
                    message += `💰 $${trade.price} | ${trade.amount} | ${trade.mode}\n`;
                    message += `⏰ ${time}\n\n`;
                });

                ctx.reply(message, {
                    parse_mode: 'HTML'
                });
            } catch (error) {
                ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('balance', async (ctx) => {
            try {
                if (!this.orchestrator?.agents?.trading) {
                    ctx.reply('❌ Trading agent not available');
                    return;
                }

                const tradingAgent = this.orchestrator.agents.trading;
                const status = tradingAgent.getStatus();

                let message = `💰 <b>ACCOUNT BALANCE</b>\n\n`;

                if (status.tradingMode === 'live') {
                    try {
                        if (!tradingAgent.binanceLive.exchange) {
                            console.log('🔧 Binance not initialized, initializing now...');
                            const initialized = await tradingAgent.binanceLive.initialize();
                            if (!initialized) {
                                ctx.reply('❌ Failed to connect to Binance');
                                return;
                            }
                        }
                        const liveBalance = await tradingAgent.binanceLive.getAccountBalance();
                        message += `🔴 <b>LIVE ACCOUNT</b>\n`;
                        message += `• USDT: $${liveBalance?.USDT?.toFixed(2) || '0.00'}\n`;
                        message += `• BTC: ${liveBalance?.BTC?.toFixed(8)}\n`;
                        message += `• ETH: ${liveBalance?.ETH?.toFixed(8)}\n`;
                    } catch (error) {
                        message += `❌ Failed to get live balance: ${error.message}`;
                    }
                } else {
                    message += `📄 <b>PAPER TRADING</b>\n`;
                    message += `• USDT: $${status.balance?.USDT?.toFixed(2)}\n`;
                    message += `• BTC: ${status.balance?.BTC?.toFixed(8)}\n`;
                    message += `• ETH: ${status.balance?.ETH?.toFixed(8)}\n`;
                }

                ctx.reply(message, {
                    parse_mode: 'HTML'
                });
            } catch (error) {
                ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('force_trade', async (ctx) => {
            try {
                ctx.reply('🔄 Forcing analysis to generate trades...');

                for (const coin of this.config.supportedCoins || ['bitcoin', 'ethereum']) {
                    await this.analysisAgent.analyzeAndAlert(coin, true);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                ctx.reply('✅ Analysis completed - check for auto trades!');
            } catch (error) {
                ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('analyze', async (ctx) => {
            try {
                const args = ctx.message.text.split(' ');
                const symbol = args[1] || 'bitcoin';

                if (!this.config.supportedCoins.includes(symbol)) {
                    ctx.reply(`❌ "${symbol}" not supported. Available: ${this.config.supportedCoins.join(', ')}`);
                    return;
                }

                ctx.reply(`🔍 Analyzing ${symbol}...`);
                const result = await this.analysisAgent.analyzeAndAlert(symbol, true);

                if (!result.success && result.error) {
                    ctx.reply(`❌ Error: ${result.error}`);
                }
            } catch (error) {
                ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('help', (ctx) => {
            const help = `
                🤖 <b>Crypto Alert Bot</b>
                <b>Commands:</b>
                /start - Start bot
                /status - Market status
                /signals - View active trading signals
                /portfolio - View portfolio status
                /pnl - View P&L summary
                /trades - View recent trades
                /balance - View account balance
                /force_trade - Force analysis to generate trades
                /analyze [coin] - Analyze specific coin
                /help - Show this help

                <b>Supported:</b> ${this.config?.supportedCoins?.join(', ') || 'bitcoin, ethereum'}
                <b>Features:</b>
                • Real-time price alerts
                • Technical indicator monitoring
                • AI-powered analysis
                • Trading signal generation
                • Risk management alerts
            `;
            ctx.reply(help, {
                parse_mode: 'HTML'
            });
        });
    }

    /**
     * Send message to Telegram
     * @param {string} message - Message to send
     * @param {string} chatId - Chat ID (optional)
     */
    async sendMessage(message, chatId = process.env.TELEGRAM_CHAT_ID) {
        try {
            await this.bot.telegram.sendMessage(
                chatId || this.config.chatId,
                message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                }
            );
            console.log('✅ Telegram message sent successfully');
            return {
                success: true
            };
        } catch (error) {
            console.error('❌ Telegram send error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Start Telegram Bot
     */
    async start() {
        try {
            if (this.isRunning) {
                return {
                    success: false,
                    message: 'Bot is already running'
                };
            }

            if (!this.bot) {
                throw new Error('Bot not initialized. Call init() first');
            }

            await this.bot.launch();
            this.isRunning = true;

            console.log('🚀 Telegram Bot started');

            // Send startup message
            await this.sendMessage('🤖 Crypto Alert Bot has started!');

            return {
                success: true,
                message: 'Bot started successfully'
            };
        } catch (error) {
            console.error('❌ Error starting Telegram Bot:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop Telegram Bot
     */
    async stop() {
        try {
            if (!this.isRunning) {
                return {
                    success: false,
                    message: 'Bot is not running'
                };
            }

            this.bot.stop();
            this.isRunning = false;

            console.log('🛑 Telegram Bot stopped');
            return {
                success: true,
                message: 'Bot stopped successfully'
            };
        } catch (error) {
            console.error('❌ Error stopping Telegram Bot:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get bot status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            configured: !!this.config,
            hasAnalysisAgent: !!this.analysisAgent,
            hasOrchestrator: !!this.orchestrator
        };
    }
}

export default new TelegramBotService();