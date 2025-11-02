import express from 'express';
import blockchainConnector from '../services/BlockchainConnector.service.js';

const router = express.Router();

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
        console.log("Agent analysis: ", orchestrator.agents)

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
                    winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length :
                    0,
                avgLoss: losingTrades.length > 0 ?
                    Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) :
                    0,
                bestTrade: closedTrades.length > 0 ?
                    Math.max(...closedTrades.map(t => t.pnl || 0)) :
                    0,
                worstTrade: closedTrades.length > 0 ?
                    Math.min(...closedTrades.map(t => t.pnl || 0)) :
                    0
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

// Blockchain endpoints
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

router.post('/dao/vote', async (req, res) => {
    try {
        const {
            proposalId,
            support
        } = req.body;
        const result = await blockchainConnector.voteOnSignal(proposalId, support);
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
            amount
        } = req.body;
        const result = await blockchainConnector.rewardUser(userAddress, amount);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

export default router;