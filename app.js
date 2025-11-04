// server.js - Main Express Server


import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'connect-flash';
import bodyParser from 'body-parser';
import methodOverride from 'method-override';

// Load environment variables
import {
    connect
} from './config/database.js';

import AgentOrchestrator from './core/AgentOrchestrator.js';
import apiRoutes from './routes/api.routes.js';
import blockchainConnector from './services/BlockchainConnector.service.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true
}));

// Kết nối với database
connect();

// để web đẹp hơn
app.use(express.static(`${process.cwd()}/public`));

// Flash
app.use(cookieParser("LHNASDASDAD"));
app.use(session({
    secret: process.env.SESSION_SECRET || "your_default_secret", // nên để trong .env
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 60000
    }
}));

app.use(flash());

// method-override:  use patch, delete,..
app.use(methodOverride('_method'));
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
// API Routes
app.use('/api', apiRoutes);

setTimeout(async () => {
    console.log('🤖 Initializing Complete Trading System...');

    const orchestrator = new AgentOrchestrator();
    app.set('orchestrator', orchestrator);
    try {

        // Initialize blockchain connector
        const blockchainConfig = {
            signalStorageABI: JSON.parse(process.env.SIGNAL_STORAGE_ABI || '[]'),
            tradeExecutorABI: JSON.parse(process.env.TRADE_EXECUTOR_ABI || '[]'),
            daoVotingABI: JSON.parse(process.env.DAO_VOTING_ABI || '[]'),
            rewardTokenABI: JSON.parse(process.env.REWARD_TOKEN_ABI || '[]')
        };

        await blockchainConnector.initialize(blockchainConfig);

        await orchestrator.initialize();
        console.log('✅ Agent orchestrator initialized');

        orchestrator.setupAgentCommunication();
        console.log('✅ Agent communication channels established');

        await orchestrator.startAllAgents();
        console.log('✅ All agents started with automatic scheduling');

        console.log('\n🎉 System fully operational - All agents running automatically!');
        console.log('📱 Active Components:');
        console.log('  • Market Agent - Real-time price monitoring');
        console.log('  • Analysis Agent - AI analysis & Telegram bot');
        console.log('  • Trading Agent - Auto trading execution');
        console.log('  • News Agent - Market news monitoring');
        console.log('  • Risk Manager - Risk management & limits');
        console.log('  • Blockchain Connector - Somnia integration');
        console.log('\n⏰ Automatic Schedules:');
        console.log('  • Quick scan: Every 5 minutes');
        console.log('  • Deep analysis: Every 30 minutes');
        console.log('  • News collection: Every hour');
        console.log('  • Portfolio check: Every 2 hours');
        console.log('  • Risk update: Every 15 minutes');
        console.log('  • Daily summary: 9:00 AM\n');
    } catch (error) {
        console.error('❌ Failed to start system:', error);
        console.error('Stack trace:', error.stack);
    }
}, 3000);

app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Crypto Co-Pilot Backend Server Started`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📡 HTTP API: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:8080`);
    console.log(`⏰ Auto-scheduling: Enabled`);
    console.log(`${'='.repeat(60)}\n`);
});

export default app;