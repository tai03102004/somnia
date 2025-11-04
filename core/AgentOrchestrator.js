import EventEmitter from 'events';
import MarketAgent from '../agents/MarketAgent.js';
import AIAnalysisAgent from '../agents/AnalysisAgent.js';
import TradingAgent from '../agents/TradingAgent.js';
import NewsAgent from '../agents/NewsAgent.js';
import RiskManager from '../agents/RiskManager.js';
import BlockchainConnector from '../services/BlockchainConnector.service.js';
import cron from 'node-cron';

class AgentOrchestrator extends EventEmitter {
    constructor() {
        super();
        this.agents = {};
        this.eventBus = new EventEmitter();
        this.isRunning = false;
        this.lastAnalysisTime = new Map();
        this.config = {
            symbols: ['BTCUSDT', 'ETHUSDT'],
            supportedCoins: ['bitcoin', 'ethereum'],
            riskLevel: "medium",
            tradingMode: 'live', // paper or live
        };
        this.blockchainConnector = BlockchainConnector;

        this.scheduledJobs = [];
    }

    async initialize() {
        console.log('🚀 Initializing Agent Orchestrator with Blockchain...');

        try {
            // ✨ Initialize Blockchain Connection
            const blockchainResult = await this.blockchainConnector.initialize();
            if (blockchainResult.success) {
                console.log(`✅ Connected to Somnia: ${blockchainResult.wallet}`);
            } else {
                console.warn('⚠️ Blockchain connection failed, continuing in off-chain mode');
            }

            console.log('🚀 Initializing Agent Orchestrator...');

            // Initialize all agents
            this.agents.market = new MarketAgent();
            const sharedConfig = {
                telegramToken: process.env.TELEGRAM_BOT_TOKEN,
                chatId: process.env.CHAT_ID,
                aiApiKey: process.env.GEMINI,
                aiModel: process.env.GEMINI_MODEL,
                aiBaseUrl: process.env.GEMINI_BASE_URL,
                supportedCoins: ['bitcoin', 'ethereum'],
                alertThresholds: {
                    priceChange: 5,
                    rsiOverbought: 70,
                    rsiOversold: 30
                }
            };

            // Khởi tạo và chạy
            this.agents.trading = new TradingAgent();
            this.agents.news = new NewsAgent();
            this.agents.risk = new RiskManager();

            if (AIAnalysisAgent.init) {
                AIAnalysisAgent.init(sharedConfig);
            }
            this.agents.analysis = AIAnalysisAgent;
            if (this.agents.analysis && this.agents.analysis.setOrchestrator) {
                this.agents.analysis.setOrchestrator(this);
                console.log('🔗 Orchestrator reference set');
            }
            if (this.agents.risk && this.agents.risk.setOrchestrator) {
                this.agents.risk.setOrchestrator(this);
                console.log('🔗 Orchestrator reference set in RiskManager');
            }
            // Setup communication between agents
            this.setupAgentCommunication();

            // Start all agents
            await this.startAllAgents();

            console.log('✅ All agents initialized and running');
            return {
                success: true,
                message: 'All agents initialized with blockchain support'
            };

        } catch (error) {
            console.error('❌ Orchestrator initialization failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    setupAgentCommunication() {
        console.log('🔗 Setting up FULL agent communication...');

        if (this.agents.analysis?.alertSystem) {
            // Khi có CRITICAL alerts -> trigger auto trade
            setInterval(() => {
                const activeSignals = this.agents.analysis.alertSystem.getActiveSignals();
                activeSignals.forEach(signal => {
                    if (signal.confidence >= 0.75 && signal.status === 'ACTIVE') {
                        this.agents.trading.executeSignal(signal);
                    }
                });
            }, 60000); // Check every minute
        }

        // ✅ Analysis -> Trading (AUTO TRADE)
        if (this.agents.analysis && this.agents.trading) {
            this.agents.analysis.on('tradingSignal', async (signal) => {
                console.log('🎯 AUTO TRADE SIGNAL RECEIVED:', signal);

                if (signal.confidence >= 0.75) {
                    console.log('✅ Signal confidence passed, executing trade...');
                    const result = await this.agents.trading.executeSignal(signal);

                    if (result?.success) {
                        console.log('✅ AUTO TRADE EXECUTED:', result.order);

                        // Send Telegram notification
                        const message = `🚀 <b>AUTO TRADE EXECUTED</b>\n\n` +
                            `🪙 <b>Coin:</b> ${signal.coin.toUpperCase()}\n` +
                            `🎯 <b>Action:</b> ${signal.action}\n` +
                            `💰 <b>Price:</b> $${result.order.price}\n` +
                            `📊 <b>Amount:</b> ${result.order.amount}\n` +
                            `🎖️ <b>Confidence:</b> ${(signal.confidence * 100).toFixed(0)}%\n` +
                            `⏰ <b>Time:</b> ${new Date().toLocaleString()}`;

                        if (this.agents.analysis.telegramBot?.sendMessage) {
                            await this.agents.analysis.telegramBot.sendMessage(message);
                        }
                    } else {
                        console.log('❌ AUTO TRADE FAILED:', result?.error);
                    }
                } else {
                    console.log(`⚠️ Signal rejected - confidence too low: ${(signal.confidence * 100).toFixed(0)}%`);
                }
            });
        }

        if (this.agents.trading && this.agents.risk) {
            this.agents.trading.on('orderExecuted', async (order) => {
                console.log('📋 Order executed, updating equity...');
                await this.agents.risk.updateEquity(this.agents.trading);

                // Update open positions count
                this.agents.risk.openPositions = this.agents.trading.portfolio.size;
            });
        }

        if (this.agents.news && this.agents.analysis) {
            this.agents.news.on('marketNews', (newsData) => {
                console.log(`📰 News received: ${newsData.sentiment}`);
                this.agents.analysis.handleNewsUpdate(newsData);
            });
        }

        if (this.agents.market && this.agents.analysis) {
            this.agents.market.on('significantPriceMove', (priceData) => {
                this.agents.analysis.updateMarketData(priceData);
            });
        }

        // ✅ Telegram messaging
        if (this.agents.trading) {
            this.agents.trading.on('sendTelegramMessage', (message) => {
                if (this.agents.analysis?.telegramBot?.sendMessage) {
                    this.agents.analysis.telegramBot.sendMessage(message);
                }
            });

            this.agents.trading.on('orderExecuted', (order) => {
                console.log('📋 Order executed:', order);
            });
        }
    }

    startAutoSchedule() {
        console.log('⏰ Starting automatic scheduling...\n');

        // 🔥 Schedule 1: Quick analysis every 5 minutes
        const quickAnalysisJob = cron.schedule('*/5 * * * *', async () => {
            console.log('\n⚡ [AUTO] Quick market scan triggered');
            try {
                for (const coin of this.config.supportedCoins) {
                    await this.agents.analysis.analyzeAndAlert(coin, false);
                }
            } catch (error) {
                console.error('❌ Quick analysis error:', error.message);
            }
        });
        this.scheduledJobs.push(quickAnalysisJob);
        console.log('✅ Quick analysis scheduled: Every 5 minutes');

        // 🔥 Schedule 2: Deep analysis every 30 minutes
        const deepAnalysisJob = cron.schedule('*/30 * * * *', async () => {
            console.log('\n🔍 [AUTO] Deep market analysis triggered');
            try {
                for (const coin of this.config.supportedCoins) {
                    await this.agents.analysis.analyzeAndAlert(coin, true);
                }
            } catch (error) {
                console.error('❌ Deep analysis error:', error.message);
            }
        });
        this.scheduledJobs.push(deepAnalysisJob);
        console.log('✅ Deep analysis scheduled: Every 30 minutes');

        // 🔥 Schedule 3: News collection every hour
        const newsJob = cron.schedule('0 * * * *', async () => {
            console.log('\n📰 [AUTO] News collection triggered');
            try {
                await this.agents.news.fetchNews();
            } catch (error) {
                console.error('❌ News collection error:', error.message);
            }
        });
        this.scheduledJobs.push(newsJob);
        console.log('✅ News collection scheduled: Every hour');

        // 🔥 Schedule 4: Portfolio rebalance check every 2 hours
        const rebalanceJob = cron.schedule('0 */2 * * *', async () => {
            console.log('\n💼 [AUTO] Portfolio rebalance check');
            try {
                const portfolio = this.agents.trading.getPortfolioStatus();
                console.log(`Current portfolio: ${portfolio.openPositions} open positions`);

                // Check if any positions need closing
                for (const [symbol, position] of this.agents.trading.portfolio.entries()) {
                    const currentPrice = await this.getMarketData(symbol);

                    // Auto close if stop loss or take profit hit
                    if (currentPrice.price <= position.stopLoss ||
                        currentPrice.price >= position.takeProfit) {
                        console.log(`🎯 Auto-closing position: ${symbol}`);
                        await this.agents.trading.closePosition(symbol, currentPrice.price);
                    }
                }
            } catch (error) {
                console.error('❌ Rebalance error:', error.message);
            }
        });
        this.scheduledJobs.push(rebalanceJob);
        console.log('✅ Portfolio rebalance scheduled: Every 2 hours');

        // 🔥 Schedule 5: Risk metrics update every 15 minutes
        const riskUpdateJob = cron.schedule('*/15 * * * *', async () => {
            console.log('\n🛡️ [AUTO] Risk metrics update');
            try {
                await this.agents.risk.updateEquity(this.agents.trading);
                const drawdown = this.agents.risk.calculateDrawdown();
                console.log(`Current drawdown: ${(drawdown * 100).toFixed(2)}%`);

                // Alert if drawdown exceeds threshold
                if (drawdown > 0.10) {
                    console.warn(`⚠️ HIGH DRAWDOWN ALERT: ${(drawdown * 100).toFixed(2)}%`);
                    await this.agents.analysis.sendTelegramMessage(
                        `🚨 <b>Risk Alert</b>\n\nDrawdown: ${(drawdown * 100).toFixed(2)}%\nAction: Monitoring`
                    );
                }
            } catch (error) {
                console.error('❌ Risk update error:', error.message);
            }
        });
        this.scheduledJobs.push(riskUpdateJob);
        console.log('✅ Risk metrics update scheduled: Every 15 minutes');

        // 🔥 Schedule 6: Daily summary at 9 AM
        const dailySummaryJob = cron.schedule('0 9 * * *', async () => {
            console.log('\n📊 [AUTO] Daily summary report');
            try {
                const portfolio = this.agents.trading.getPortfolioStatus();
                const riskMetrics = {
                    equity: this.agents.risk.currentEquity,
                    drawdown: this.agents.risk.calculateDrawdown(),
                    dailyPnL: this.agents.risk.dailyPnL
                };

                const summary = `
📊 <b>Daily Summary Report</b>

💼 <b>Portfolio:</b>
• Open Positions: ${portfolio.openPositions}
• Total Trades: ${portfolio.totalTrades}
• Win Rate: ${portfolio.winRate}%

💰 <b>Performance:</b>
• Daily P&L: $${riskMetrics.dailyPnL.toFixed(2)}
• Current Equity: $${riskMetrics.equity.toFixed(2)}
• Drawdown: ${(riskMetrics.drawdown * 100).toFixed(2)}%

⏰ ${new Date().toLocaleString('vi-VN')}
                `.trim();

                await this.agents.analysis.sendTelegramMessage(summary);
            } catch (error) {
                console.error('❌ Daily summary error:', error.message);
            }
        });
        this.scheduledJobs.push(dailySummaryJob);
        console.log('✅ Daily summary scheduled: 9:00 AM daily');

        console.log('\n🎉 All automatic schedules activated!\n');
    }

    // ✅ Stop all scheduled jobs
    stopAutoSchedule() {
        console.log('⏸️ Stopping all scheduled jobs...');
        this.scheduledJobs.forEach(job => job.stop());
        this.scheduledJobs = [];
        console.log('✅ All scheduled jobs stopped');
    }

    getStatus() {
        const status = {
            isRunning: this.isRunning,
            agents: {},
            totalAlerts: 0,
            activeSignals: 0,
            scheduledJobs: this.scheduledJobs.length,
            timestamp: Date.now()
        };

        for (const [name, agent] of Object.entries(this.agents)) {
            status.agents[name] = {
                isRunning: agent.isRunning || false,
                status: agent.getStatus ? agent.getStatus() : 'No status available'
            };
        }

        // Get additional metrics from analysis agent
        if (this.agents.analysis && this.agents.analysis.getStatus) {
            const analysisStatus = this.agents.analysis.getStatus();
            status.totalAlerts = analysisStatus.totalAlerts || 0;
            status.activeSignals = analysisStatus.activeSignals || 0;
        }

        return status;
    }

    getSystemStatus() {
        return this.getStatus();
    }

    // ✅ Add missing helper function
    convertSymbolToCoinId(symbol) {
        const mapping = {
            'BTCUSDT': 'bitcoin',
            'ETHUSDT': 'ethereum',
            'BNBUSDT': 'binancecoin',
            'ADAUSDT': 'cardano',
            'DOGEUSDT': 'dogecoin',
            'XRPUSDT': 'ripple',
            'SOLUSDT': 'solana'
        };
        return mapping[symbol] || 'bitcoin';
    }

    async startAllAgents() {
        const startOrder = ['market', 'risk', 'trading', 'news', 'analysis'];

        for (const agentName of startOrder) {
            if (this.agents[agentName]) {
                try {
                    console.log(`🔄 Starting ${agentName} agent...`);
                    await this.agents[agentName].start(this.config);
                    console.log(`✅ ${agentName} agent started`);
                } catch (error) {
                    console.error(`❌ Failed to start ${agentName} agent:`, error.message);
                    console.warn(`⚠️ Continuing without ${agentName} agent`);
                }
            }
        }

        this.isRunning = true;
        this.startAutoSchedule();

        console.log('\n🎉 All agents initialization complete!');
        this.printAgentStatus();

        console.log('\n🚀 Running initial market analysis...');
        setTimeout(async () => {
            for (const coin of this.config.supportedCoins) {
                await this.agents.analysis.analyzeAndAlert(coin, true);
            }
        }, 5000);
    }

    printAgentStatus() {
        console.log('\n📊 Agent Status Summary:');
        console.log('─'.repeat(50));

        for (const [name, agent] of Object.entries(this.agents)) {
            const status = agent.isRunning ? '✅ RUNNING' : '❌ STOPPED';
            console.log(`${name.padEnd(15)} ${status}`);
        }

        console.log('─'.repeat(50) + '\n');
    }

    async stop() {
        console.log('🛑 Stopping all agents...');

        this.stopAutoSchedule();

        for (const [name, agent] of Object.entries(this.agents)) {
            if (agent.stop) {
                try {
                    await agent.stop();
                    console.log(`✅ ${name} agent stopped`);
                } catch (error) {
                    console.error(`❌ Error stopping ${name}:`, error.message);
                }
            }
        }

        this.isRunning = false;
        return {
            success: true,
            message: 'System stopped successfully'
        };
    }

    // Manual trigger for testing
    async triggerAnalysis(coinId = 'bitcoin') {
        // THÊM RATE LIMITING
        const now = Date.now();
        const lastTime = this.lastAnalysisTime.get(coinId) || 0;
        const minInterval = 30000; // 30 giây

        if ((now - lastTime) < minInterval) {
            console.log(`⏭️ Skipping ${coinId} - analyzed ${Math.round((now - lastTime)/1000)}s ago`);
            return {
                success: false,
                error: `Please wait ${Math.round((minInterval - (now - lastTime))/1000)}s before next analysis`
            };
        }

        this.lastAnalysisTime.set(coinId, now);

        if (this.agents.analysis) {
            return await this.agents.analysis.analyzeAndAlert(coinId, true);
        }
        return {
            success: false,
            error: 'Analysis agent not available'
        };
    }

    async getMarketData(symbol) {
        if (this.agents.market && this.agents.market.priceCache) {
            return this.agents.market.priceCache.get(symbol);
        }
        return null;
    }

    async collectNews() {
        if (this.agents.news) {
            return await this.agents.news.fetchNews();
        }
        return {
            success: false,
            message: 'News agent not available'
        };
    }
}

export default AgentOrchestrator;