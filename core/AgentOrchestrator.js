import EventEmitter from 'events';
import MarketAgent from '../agents/MarketAgent.js';
import AIAnalysisAgent from '../agents/AnalysisAgent.js';
import TradingAgent from '../agents/TradingAgent.js';
import NewsAgent from '../agents/NewsAgent.js';
import RiskManager from '../agents/RiskManager.js';
import BlockchainConnector from '../services/BlockchainConnector.service.js';

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
        console.log('🔇 Optimized agent communication (rate limit safe)');

        // ✅ REMOVED: Market Agent -> Analysis Agent (too many triggers)
        // Market data updates are now manual only

        // ✅ REMOVED: News Agent (runs independently)

        // ✅ KEPT: Analysis -> Trading (essential)
        if (this.agents.analysis && this.agents.trading) {
            this.agents.analysis.on('tradingSignal', async (signal) => {
                if (signal.confidence >= 0.75) {
                    const result = await this.agents.trading.executeSignal(signal);
                    if (result?.success) {
                        console.log('✅ AUTO TRADE:', result.order.symbol);
                    }
                }
            });
        }

        // ✅ KEPT: Telegram messaging
        if (this.agents.trading) {
            this.agents.trading.on('sendTelegramMessage', (message) => {
                if (this.agents.analysis?.sendTelegramMessage) {
                    this.agents.analysis.sendTelegramMessage(message);
                }
            });
        }
    }

    getStatus() {
        const status = {
            isRunning: this.isRunning,
            agents: {},
            totalAlerts: 0,
            activeSignals: 0,
            timestamp: Date.now()
        };

        for (const [name, agent] of Object.entries(this.agents)) {
            if (agent && agent.getStatus) {
                status.agents[name] = agent.getStatus();
            } else {
                status.agents[name] = 'unknown';
            }
        }

        // Get additional metrics from analysis agent
        if (this.agents.analysis && this.agents.analysis.getStatus) {
            const analysisStatus = this.agents.analysis.getStatus();
            status.totalAlerts = analysisStatus.cronJobs || 0;
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
            const agent = this.agents[agentName];
            try {
                if (agentName === 'analysis') {
                    // Analysis agent singleton
                    if (agent && agent.start) {
                        const result = await agent.start();
                        if (result?.success !== false) {
                            console.log(`✅ ${agentName} agent started`);
                        } else {
                            console.warn(`⚠️ ${agentName} agent start failed: ${result?.error}`);
                        }
                    }
                } else if (agent && agent.start) {
                    const result = await agent.start(this.config);
                    if (result?.success !== false) {
                        console.log(`✅ ${agentName} agent started`);
                    } else {
                        console.warn(`⚠️ ${agentName} agent start failed: ${result?.error}`);
                    }
                } else {
                    console.warn(`⚠️ ${agentName} agent not found or no start method`);
                }
            } catch (error) {
                console.error(`❌ Failed to start ${agentName} agent:`, error.message);
                // Continue to next agent instead of stopping
            }
        }

        this.isRunning = true;
        console.log('\n🎉 All agents initialization complete!');
        this.printAgentStatus();
    }

    printAgentStatus() {
        console.log('\n📊 Agent Status Summary:');
        console.log('─'.repeat(50));

        for (const [name, agent] of Object.entries(this.agents)) {
            const status = agent.getStatus ? agent.getStatus() : {
                isRunning: false
            };
            const icon = status.isRunning ? '✅' : '❌';
            console.log(`${icon} ${name.padEnd(15)} - ${status.isRunning ? 'Running' : 'Stopped'}`);
        }

        console.log('─'.repeat(50) + '\n');
    }

    async stop() {
        console.log('🛑 Stopping all agents...');

        for (const [name, agent] of Object.entries(this.agents)) {
            try {
                if (agent && agent.stop) {
                    await agent.stop();
                }
                console.log(`✅ ${name} agent stopped`);
            } catch (error) {
                console.error(`❌ Error stopping ${name} agent:`, error);
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
            return this.agents.market.priceCache.get(symbol) || null;
        }
        return null;
    }

    // Force news collection
    async collectNews() {
        try {
            if (this.agents.news && this.agents.news.collectCryptoNews) {
                await this.agents.news.collectCryptoNews();
                return {
                    success: true,
                    message: 'News collection triggered'
                };
            }
            return {
                success: false,
                error: 'News agent not available'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default AgentOrchestrator;