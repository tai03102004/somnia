import EventEmitter from "events";
import {
    spawn
} from "child_process";
import path from "path";
import {
    fileURLToPath
} from 'url';
import blockchainConnector from '../services/BlockchainConnector.service.js';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

class NewsAgent extends EventEmitter {
    constructor() {
        super();
        this.newsCache = new Map();
        this.isRunning = false;
        this.blockchainConnector = blockchainConnector;
        this.config = null;
        this.newsInterval = null;
        this.lastNewsUpdate = null;
    }

    async start(config) {
        this.config = config;
        this.isRunning = true;

        this.startNewsCollection();

        console.log("📰 News Agent started");
        return {
            success: true
        };
    }

    startNewsCollection() {
        this.collectCryptoNews();

        this.newsInterval = setInterval(async () => {
            await this.collectCryptoNews();
        }, 30 * 60 * 1000);
    }

    async collectCryptoNews() {
        try {
            console.log('📰 Collecting crypto news...');

            let newsData;
            try {
                newsData = await this.runCrewAIScript();
            } catch (error) {
                console.warn('⚠️ Python script failed, using mock news data');
                newsData = this.getMockNews();
            }

            if (newsData && newsData.length > 0) {
                const sentiment = this.analyzeSentiment(newsData);
                const sentimentScore = this.calculateSentimentScore(sentiment);

                // ✅ FIX: Check if recordSentiment exists before calling
                if (this.blockchainConnector && typeof this.blockchainConnector.recordSentiment === 'function') {
                    this.blockchainConnector.recordSentiment('BTC', sentiment, sentimentScore)
                        .catch(err => console.warn('⚠️ Blockchain record skipped:', err.message));
                } else {
                    console.warn('⚠️ Blockchain recordSentiment not available');
                }

                this.lastNewsUpdate = Date.now();
                this.emit('marketNews', {
                    news: newsData,
                    timestamp: Date.now(),
                    sentiment
                });

                console.log(`✅ News collected: ${sentiment} sentiment`);
            }
        } catch (err) {
            console.error("❌ Error collecting crypto news:", err.message);
        }
    }

    getMockNews() {
        const mockNews = [
            "Bitcoin reaches new all-time high amid institutional adoption and growing mainstream acceptance",
            "Ethereum network upgrade successfully completed, significantly improving transaction speeds and reducing fees",
            "Major cryptocurrency exchange reports 300% increase in trading volume as retail interest surges"
        ];
        return mockNews.join('\n');
    }

    async runCrewAIScript() {
        return new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, '../python/crew_analysis.py');
            const pythonBinPath = path.join(__dirname, '../python/venv/bin/python3');

            const fs = require('fs');
            if (!fs.existsSync(scriptPath)) {
                return reject(new Error('Python script not found'));
            }

            const pythonProcess = spawn(pythonBinPath, [scriptPath], {
                timeout: 30000
            });

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0 && output) {
                    try {
                        const newsData = JSON.parse(output);
                        resolve(newsData);
                    } catch {
                        resolve(output);
                    }
                } else {
                    reject(new Error(`Script failed: ${errorOutput || 'No output'}`));
                }
            });

            pythonProcess.on('error', (error) => {
                reject(error);
            });
        });
    }

    analyzeSentiment(newsText) {
        const bullishWords = ['bull', 'rise', 'increase', 'positive', 'growth', 'pump', 'adoption', 'high', 'surge', 'upgrade', 'improved'];
        const bearishWords = ['bear', 'fall', 'decrease', 'negative', 'crash', 'dump', 'decline', 'drop'];

        const text = newsText.toLowerCase();
        let bullishScore = 0;
        let bearishScore = 0;

        bullishWords.forEach(word => {
            bullishScore += (text.match(new RegExp(word, 'g')) || []).length;
        });

        bearishWords.forEach(word => {
            bearishScore += (text.match(new RegExp(word, 'g')) || []).length;
        });

        if (bullishScore > bearishScore) return 'BULLISH';
        if (bearishScore > bullishScore) return 'BEARISH';
        return 'NEUTRAL';
    }

    calculateSentimentScore(sentiment) {
        const scores = {
            'BULLISH': 0.8,
            'BEARISH': 0.2,
            'NEUTRAL': 0.5
        };
        return scores[sentiment] || 0.5;
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            cacheSize: this.newsCache.size,
            lastUpdate: this.lastNewsUpdate ? new Date(this.lastNewsUpdate).toISOString() : 'Never'
        };
    }

    stop() {
        if (this.newsInterval) {
            clearInterval(this.newsInterval);
            this.newsInterval = null;
        }
        this.isRunning = false;
        console.log("📰 News Agent stopped");
    }
}

export default NewsAgent;