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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

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

// bodyParser: để có thể lấy data trong req.body (key:value) từ phía client nhập vào
app.use(bodyParser.urlencoded({
    extended: false
}));

// method-override:  use patch, delete,..
app.use(methodOverride('_method'));

// API Routes
app.use('/api', apiRoutes);

setTimeout(async () => {
    console.log('🤖 Initializing Telegram Bot...');

    const orchestrator = new AgentOrchestrator();

    // Store orchestrator in app for API routes
    app.set('orchestrator', orchestrator);

    const result = await orchestrator.initialize();


    if (result.success) {
        console.log('✅ Complete Trading System started successfully!');
        console.log('📱 All agents are now running:');
        console.log('  • Market Agent - Price monitoring');
        console.log('  • Analysis Agent - AI analysis & Telegram bot');
        console.log('  • Trading Agent - Auto trading');
        console.log('  • News Agent - News monitoring');
        console.log('  • Risk Manager - Risk management');
    } else {
        console.error('❌ Failed to start Trading System:', result.error);
    }
}, 3000);

app.listen(PORT, () => {
    console.log(`Crypto Co-Pilot Backend running on port ${PORT}`);
    console.log(`WebSocket server running on port 8080`);
    console.log('Scheduled analysis every 5 minutes');
});

export default app;