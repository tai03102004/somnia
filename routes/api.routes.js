import express from 'express';
import blockchainConnector from '../services/BlockchainConnector.service.js';

const router = express.Router();
import dotenv from 'dotenv';
dotenv.config();
// Health check
router.get('/health', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator) {
            return res.status(503).json({
                status: 'initializing',
                message: 'System is still starting up',
                timestamp: Date.now()
            });
        }

        const status = orchestrator.getStatus();
        const healthChecks = {};

        // Check each agent
        for (const [name, agentStatus] of Object.entries(status.agents)) {
            healthChecks[name] = {
                status: agentStatus.isRunning ? 'healthy' : 'down',
                details: agentStatus
            };
        }

        // Check RiskManager equity tracking
        if (orchestrator.agents.risk) {
            healthChecks.risk.equity = {
                current: orchestrator.agents.risk.currentEquity,
                peak: orchestrator.agents.risk.peakEquity,
                drawdown: `${(orchestrator.agents.risk.calculateDrawdown() * 100).toFixed(2)}%`
            };
        }

        // Overall system health
        const allHealthy = Object.values(healthChecks).every(
            check => check.status === 'healthy'
        );

        res.json({
            status: allHealthy ? 'healthy' : 'degraded',
            timestamp: Date.now(),
            agents: healthChecks,
            system: status
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: Date.now()
        });
    }
});

// Market data endpoints
router.get('/market/status', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.analysis) {
            return res.status(503).json({
                error: 'Analysis agent not available'
            });
        }

        const result = await orchestrator.agents.analysis.getMarketStatus();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/market/signals', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.analysis) {
            return res.status(503).json({
                error: 'Analysis agent not available'
            });
        }

        const signals = orchestrator.agents.analysis.alertSystem.getActiveSignals();
        res.json({
            success: true,
            signals
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Trading endpoints
router.get('/trading/portfolio', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        const portfolio = orchestrator.agents.trading.getPortfolioStatus();

        const riskMetrics = orchestrator.agents.risk ? {
            dailyPnL: orchestrator.agents.risk.dailyPnL,
            openPositions: orchestrator.agents.risk.openPositions,
            currentEquity: orchestrator.agents.risk.currentEquity,
            peakEquity: orchestrator.agents.risk.peakEquity,
            drawdown: orchestrator.agents.risk.calculateDrawdown(),
            riskLimits: orchestrator.agents.risk.riskLimits
        } : null;

        res.json({
            success: true,
            portfolio: {
                ...portfolio,
                risk: riskMetrics
            }
        });
    } catch (error) {
        console.error('Portfolio API error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/trading/history', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        const {
            limit = 50, symbol, side, status
        } = req.query;
        let history = orchestrator.agents.trading.orderHistory;

        // ✅ Apply filters
        if (symbol) {
            history = history.filter(order => order.symbol === symbol);
        }
        if (side) {
            history = history.filter(order => order.side === side.toUpperCase());
        }
        if (status) {
            history = history.filter(order => order.status === status.toUpperCase());
        }

        // ✅ Sort by timestamp (newest first)
        history = history.sort((a, b) => b.timestamp - a.timestamp);

        // ✅ Limit results
        history = history.slice(0, parseInt(limit));

        // ✅ Calculate summary stats
        const summary = {
            totalTrades: history.length,
            totalPnL: history.reduce((sum, order) => sum + (order.pnl || 0), 0),
            openTrades: history.filter(order => order.status === 'OPEN').length,
            closedTrades: history.filter(order => order.status === 'CLOSED').length,
            avgTradeSize: history.reduce((sum, order) => sum + order.amount, 0) / history.length
        };

        res.json({
            success: true,
            history: history,
            summary: summary,
            pagination: {
                total: orchestrator.agents.trading.orderHistory.length,
                returned: history.length,
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('History API error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/trading/trade/:orderId', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');
        const {
            orderId
        } = req.params;

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        const trade = orchestrator.agents.trading.orderHistory.find(
            order => order.id === orderId
        );

        if (!trade) {
            return res.status(404).json({
                success: false,
                error: 'Trade not found'
            });
        }

        res.json({
            success: true,
            trade: trade
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/trading/stats', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        const history = orchestrator.agents.trading.orderHistory;
        const portfolio = orchestrator.agents.trading.getPortfolioStatus();

        // Calculate detailed stats
        const closedTrades = history.filter(order => order.status === 'CLOSED');
        const totalPnL = closedTrades.reduce((sum, order) => sum + (order.pnl || 0), 0);
        const winningTrades = closedTrades.filter(order => (order.pnl || 0) > 0);
        const losingTrades = closedTrades.filter(order => (order.pnl || 0) < 0);

        const stats = {
            overview: {
                totalTrades: history.length,
                openPositions: portfolio.openPositions,
                closedPositions: closedTrades.length,
                totalPnL: totalPnL,
                dailyPnL: portfolio.dailyPnL
            },
            performance: {
                winRate: portfolio.winRate,
                winningTrades: winningTrades.length,
                losingTrades: losingTrades.length,
                avgWin: winningTrades.length > 0 ?
                    winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0,
                avgLoss: losingTrades.length > 0 ?
                    Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0,
                bestTrade: closedTrades.length > 0 ?
                    Math.max(...closedTrades.map(t => t.pnl || 0)) : 0,
                worstTrade: closedTrades.length > 0 ?
                    Math.min(...closedTrades.map(t => t.pnl || 0)) : 0
            },
            risk: {
                currentEquity: orchestrator.agents.risk?.currentEquity || 0,
                peakEquity: orchestrator.agents.risk?.peakEquity || 0,
                drawdown: orchestrator.agents.risk?.calculateDrawdown() || 0,
                riskLimits: orchestrator.agents.risk?.riskLimits || {}
            }
        };

        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/trading/balance', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                error: 'Trading agent not available'
            });
        }

        const balance = await orchestrator.agents.trading.binanceLive.getAccountBalance();
        res.json({
            success: true,
            balance
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});


router.post('/trading/auto-trading', async (req, res) => {
    try {
        const {
            enabled,
            mode = 'paper'
        } = req.body;
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        // Update auto trading status
        orchestrator.agents.trading.autoTradingEnabled = enabled;
        orchestrator.agents.trading.tradingMode = mode;

        // If enabling, also enable analysis agent auto-execution
        if (orchestrator.agents.analysis) {
            orchestrator.agents.analysis.autoExecuteSignals = enabled;
        }

        const statusMessage = enabled ?
            `Auto trading enabled in ${mode} mode` :
            'Auto trading disabled';

        console.log(`🤖 ${statusMessage}`);

        res.json({
            success: true,
            message: statusMessage,
            autoTrading: enabled,
            mode: mode,
            timestamp: Date.now()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/trading/auto-trading/status', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        res.json({
            success: true,
            autoTrading: orchestrator.agents.trading.autoTradingEnabled || false,
            mode: orchestrator.agents.trading.tradingMode || 'paper',
            analysisAutoExecute: orchestrator.agents.analysis?.autoExecuteSignals || false
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/trading/mode', async (req, res) => {
    try {
        const {
            mode
        } = req.body;
        const orchestrator = req.app.get('orchestrator');

        if (!['paper', 'live'].includes(mode)) {
            return res.status(400).json({
                success: false,
                error: 'Mode must be either "paper" or "live"'
            });
        }

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        orchestrator.agents.trading.tradingMode = mode;

        res.json({
            success: true,
            message: `Trading mode switched to ${mode}`,
            mode: mode
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/trading/execute', async (req, res) => {
    try {
        const {
            symbol,
            side,
            amount,
            type = 'market',
            price
        } = req.body;
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        // Create a manual signal
        const manualSignal = {
            coin: symbol.replace('USDT', '').toLowerCase(),
            action: side.toUpperCase(),
            confidence: 1.0, // Manual trades have full confidence
            entryPoint: price || 0,
            stopLoss: 0,
            takeProfit: 0,
            reasoning: 'Manual trade execution',
            manual: true
        };

        const result = await orchestrator.agents.trading.executeSignal(manualSignal);

        res.json({
            success: result.success,
            order: result.order,
            message: result.success ? 'Trade executed successfully' : result.error
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/trading/close-position', async (req, res) => {
    try {
        const {
            symbol
        } = req.body;
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        const position = orchestrator.agents.trading.portfolio.get(symbol);
        if (!position) {
            return res.status(404).json({
                success: false,
                error: 'Position not found'
            });
        }

        // Create close signal
        const closeSignal = {
            coin: symbol.replace('USDT', '').toLowerCase(),
            action: 'SELL',
            confidence: 1.0,
            entryPoint: position.currentPrice || position.entryPrice,
            stopLoss: 0,
            takeProfit: 0,
            reasoning: 'Manual position close',
            manual: true
        };

        const result = await orchestrator.agents.trading.executeSignal(closeSignal);

        res.json({
            success: result.success,
            order: result.order,
            message: result.success ? 'Position closed successfully' : result.error
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/trading/close-all', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                success: false,
                error: 'Trading agent not available'
            });
        }

        const results = [];
        const portfolio = orchestrator.agents.trading.portfolio;

        for (const [symbol, position] of portfolio) {
            try {
                const closeSignal = {
                    coin: symbol.replace('USDT', '').toLowerCase(),
                    action: 'SELL',
                    confidence: 1.0,
                    entryPoint: position.currentPrice || position.entryPrice,
                    stopLoss: 0,
                    takeProfit: 0,
                    reasoning: 'Close all positions',
                    manual: true
                };

                const result = await orchestrator.agents.trading.executeSignal(closeSignal);
                results.push({
                    symbol,
                    success: result.success,
                    order: result.order
                });
            } catch (error) {
                results.push({
                    symbol,
                    success: false,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            results: results,
            closed: results.filter(r => r.success).length,
            total: results.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Analysis endpoints
router.post('/analysis/trigger', async (req, res) => {
    // try {
    const {
        coin
    } = req.body;

    // ✅ Validate input
    if (!coin || typeof coin !== 'string' || coin.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Valid coin symbol is required (e.g., "bitcoin" or "ethereum")'
        });
    }

    const orchestrator = req.app.get('orchestrator');

    if (!orchestrator || !orchestrator.agents?.analysis) {
        return res.status(503).json({
            success: false,
            error: 'Analysis agent not available'
        });
    }

    // ✅ Normalize coin symbol
    const normalizedCoin = coin.trim().toLowerCase();

    // ✅ Check if coin is supported
    const supportedCoins = ['bitcoin', 'ethereum'];
    if (!supportedCoins.includes(normalizedCoin)) {
        return res.status(400).json({
            success: false,
            error: `Unsupported coin. Supported: ${supportedCoins.join(', ')}`
        });
    }

    const result = await orchestrator.agents.analysis.analyzeAndAlert(normalizedCoin, true);
    res.json(result);
    // } catch (error) {
    //     res.status(500).json({
    //         success: false,
    //         error: error.message
    //     });
    // }
});

router.post('/ai/chat', async (req, res) => {
    try {
        const {
            message
        } = req.body;

        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        // Get current context data
        const orchestrator = req.app.get('orchestrator');
        let contextData = '';

        try {
            if (orchestrator && orchestrator.agents?.analysis) {
                const marketStatus = await orchestrator.agents.analysis.getMarketStatus();
                const activeSignals = orchestrator.agents.analysis.alertSystem.getActiveSignals();

                if (marketStatus.data && marketStatus.data.length > 0) {
                    contextData += `\nCurrent Market Data:\n`;
                    marketStatus.data.forEach(coin => {
                        contextData += `- ${coin.name}: $${coin.current_price} (${coin.price_change_percentage_24h?.toFixed(2)}% 24h)\n`;
                    });
                }

                if (activeSignals && activeSignals.length > 0) {
                    contextData += `\nActive Trading Signals:\n`;
                    activeSignals.forEach(signal => {
                        contextData += `- ${signal.coin.toUpperCase()}: ${signal.action} (${(signal.confidence * 100).toFixed(0)}% confidence)\n`;
                    });
                }
            }
        } catch (error) {
            console.log('Could not fetch context data:', error.message);
        }

        // Call Gemini AI directly
        const aiResponse = await callGeminiAI(message.trim(), contextData);

        res.json({
            success: true,
            response: aiResponse,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('AI Chat error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process AI chat request'
        });
    }
});

// Direct Gemini AI call function
const GEMINI_API_KEY = process.env.GEMINI;

export async function callGeminiAI(userMessage, contextData = '') {
    try {
        // Create system prompt
        const systemPrompt = `You are a professional cryptocurrency trading assistant powered by Somnia blockchain technology.

            About Somnia:
            - Somnia is a high-performance Layer 1 blockchain designed for AI applications and gaming
            - It provides transparent on-chain storage for trading signals and analytics
            - Features smart contracts for automated trading and risk management
            - Enables community governance through DAO voting

            Your capabilities:
            - Cryptocurrency market analysis and trading advice
            - Explain blockchain and Somnia technology
            - Portfolio management guidance
            - Technical analysis (RSI, MACD, moving averages,s etc.)
            - General crypto knowledge and education

            ${contextData ? `Current Market Context:${contextData}` : 'Market data is currently loading...'}

            Important: Always include risk warnings when giving financial advice. Never guarantee profits. Emphasize doing your own research.

            Please respond in a helpful, professional manner. Use emojis appropriately and format your response clearly.`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

        const body = {
            contents: [{
                parts: [{
                    text: `${systemPrompt}\n\nUser Question: ${userMessage}`
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 1,
                topP: 1,
                maxOutputTokens: 2048,
                stopSequences: []
            },
            safetySettings: [{
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const responseText = await response.text();

        if (!response.ok) {
            console.error('❌ Gemini API Error Details:', responseText);
            throw new Error(`Gemini API Error: ${response.status}\nDetails: ${responseText}`);
        }

        const data = JSON.parse(responseText);

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            const aiResponse = data.candidates[0].content.parts[0].text;
            console.log('✅ AI Response received (length):', aiResponse.length);
            return aiResponse;
        } else {
            console.error('❌ Invalid response format:', JSON.stringify(data, null, 2));
            throw new Error('Invalid Gemini response format');
        }
    } catch (error) {
        console.error('❌ Gemini AI Error:', error.message);
    }
}


// Blockchain endpoints

router.get('/blockchain/analytics', async (req, res) => {
    try {
        const result = await blockchainConnector.getAnalytics();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.post('/blockchain/retry-cache', async (req, res) => {
    try {
        const result = await blockchainConnector.retryCachedSubmissions();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/blockchain/status', async (req, res) => {
    try {
        const status = blockchainConnector.getStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.post('/blockchain/submit-signal', async (req, res) => {
    try {
        const signal = req.body;
        const result = await blockchainConnector.submitSignal(signal);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/blockchain/signals', async (req, res) => {
    try {
        const {
            limit = 10
        } = req.query;
        const result = await blockchainConnector.getLatestSignals(parseInt(limit));
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/blockchain/my-signals', async (req, res) => {
    try {
        const result = await blockchainConnector.getMySignals();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/blockchain/signal/:id', async (req, res) => {
    try {
        const result = await blockchainConnector.getSignalById(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// DAO Voting endpoints
router.post('/dao/create-proposal', async (req, res) => {
    try {
        const {
            signalId,
            description
        } = req.body;
        const result = await blockchainConnector.createVotingProposal(signalId, description);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/blockchain/trades', async (req, res) => {
    try {
        const {
            address
        } = req.query;
        const result = await blockchainConnector.getUserTrades(address);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/blockchain/trade/:id', async (req, res) => {
    try {
        const result = await blockchainConnector.getTradeById(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/blockchain/volume/:address?', async (req, res) => {
    try {
        const {
            address
        } = req.params;
        const result = await blockchainConnector.getUserVolume(address);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.post('/blockchain/execute-trade', async (req, res) => {
    try {
        const trade = req.body;
        const result = await blockchainConnector.executeTrade(trade);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.post('/dao/proposal', async (req, res) => {
    try {
        const {
            signalId,
            description
        } = req.body;

        if (!signalId) {
            return res.status(400).json({
                success: false,
                error: 'signalId is required'
            });
        }

        const result = await blockchainConnector.createVotingProposal(
            signalId,
            description
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/dao/voting-power/:address?', async (req, res) => {
    try {
        const {
            address
        } = req.params;
        const result = await blockchainConnector.getVotingPower(address);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/dao/signals', async (req, res) => {
    try {
        // Get signals with 60-75% confidence for DAO voting
        const signals = await blockchainConnector.getLatestSignals(50);

        if (signals.success) {
            const eligibleSignals = signals.data.filter(s =>
                s.confidence >= 60 && s.confidence < 75
            );

            res.json({
                success: true,
                signals: eligibleSignals
            });
        } else {
            res.json(signals);
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});



router.get('/dao/proposal/:id', async (req, res) => {
    try {
        const result = await blockchainConnector.getProposal(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.post('/dao/vote', async (req, res) => {
    try {
        const {
            proposalId,
            support
        } = req.body;

        if (proposalId === undefined || support === undefined) {
            return res.status(400).json({
                success: false,
                error: 'proposalId and support (true/false) are required'
            });
        }

        const result = await blockchainConnector.voteOnSignal(
            proposalId,
            Boolean(support)
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/dao/voting-power/:address?', async (req, res) => {
    try {
        const {
            address
        } = req.params;
        const result = await blockchainConnector.getVotingPower(address);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Reward endpoints
router.post('/rewards/distribute', async (req, res) => {
    try {
        const {
            userAddress,
            amount,
            reason
        } = req.body;

        if (!userAddress || !amount) {
            return res.status(400).json({
                success: false,
                error: 'userAddress and amount are required'
            });
        }

        const result = await blockchainConnector.rewardUser(
            userAddress,
            parseFloat(amount),
            reason
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.post('/rewards/bulk-distribute', async (req, res) => {
    try {
        const {
            recipients
        } = req.body;

        if (!Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'recipients array is required'
            });
        }

        const result = await blockchainConnector.distributeRewards(recipients);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/rewards/balance', async (req, res) => {
    try {
        const result = await blockchainConnector.getTokenBalance();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/rewards/balance/:address?', async (req, res) => {
    try {
        const {
            address
        } = req.params;
        const result = await blockchainConnector.getTokenBalance(address);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

export default router;