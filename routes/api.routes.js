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

        res.json({
            status: 'ok',
            timestamp: Date.now(),
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
                error: 'Trading agent not available'
            });
        }

        const portfolio = orchestrator.agents.trading.getPortfolioStatus();
        res.json({
            success: true,
            portfolio
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

router.get('/trading/history', async (req, res) => {
    try {
        const orchestrator = req.app.get('orchestrator');

        if (!orchestrator || !orchestrator.agents?.trading) {
            return res.status(503).json({
                error: 'Trading agent not available'
            });
        }

        const history = orchestrator.agents.trading.orderHistory;
        res.json({
            success: true,
            history
        });
    } catch (error) {
        res.status(500).json({
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