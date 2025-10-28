import {
    ethers
} from 'ethers';
import fs from 'fs';
import path from 'path';
import {
    fileURLToPath
} from 'url';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

class BlockchainConnector {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this.signalStorageContract = null;
        this.tradeExecutorContract = null;
        this.isConnected = false;
    }

    async initialize() {
        try {
            // Somnia Testnet Configuration
            const somniaConfig = {
                rpcUrl: process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network',
                chainId: parseInt(process.env.SOMNIA_CHAIN_ID || '50311'),
                privateKey: process.env.SOMNIA_PRIVATE_KEY,
                signalStorageAddress: process.env.SIGNAL_STORAGE_ADDRESS,
                tradeExecutorAddress: process.env.TRADE_EXECUTOR_ADDRESS
            };

            if (!somniaConfig.privateKey) {
                throw new Error('SOMNIA_PRIVATE_KEY not set in environment');
            }

            console.log(`🔗 Connecting to Somnia Network...`);
            console.log(`📍 RPC: ${somniaConfig.rpcUrl}`);
            console.log(`🆔 Chain ID: ${somniaConfig.chainId}`);

            // ✨ FIX: Create network object without ENS support
            const network = {
                name: 'somnia-testnet',
                chainId: somniaConfig.chainId
            };

            this.provider = new ethers.JsonRpcProvider(
                somniaConfig.rpcUrl,
                new ethers.Network("somnia-testnet", somniaConfig.chainId)
            );


            this.wallet = new ethers.Wallet(somniaConfig.privateKey, this.provider);
            console.log(`💼 Wallet: ${this.wallet.address}`);

            // Check balance
            const balance = await this.provider.getBalance(this.wallet.address);
            console.log(`💰 Wallet Balance: ${ethers.formatEther(balance)} STT`);

            // ✨ Only load contracts if addresses are provided
            if (somniaConfig.signalStorageAddress && somniaConfig.signalStorageAddress !== 'deployed_contract_address') {
                // Load contract ABIs
                const abisPath = path.join(__dirname, '../contracts/abis');

                if (fs.existsSync(path.join(abisPath, 'SignalStorage.json'))) {
                    const signalStorageABI = JSON.parse(
                        fs.readFileSync(path.join(abisPath, 'SignalStorage.json'), 'utf8')
                    );

                    this.signalStorageContract = new ethers.Contract(
                        somniaConfig.signalStorageAddress,
                        signalStorageABI,
                        this.wallet
                    );
                    console.log(`✅ SignalStorage contract connected: ${somniaConfig.signalStorageAddress}`);
                } else {
                    console.warn('⚠️ SignalStorage ABI not found. Run: npm run compile:contracts');
                }
            } else {
                console.warn('⚠️ SIGNAL_STORAGE_ADDRESS not set. Skipping contract initialization.');
            }

            if (somniaConfig.tradeExecutorAddress && somniaConfig.tradeExecutorAddress !== 'deployed_contract_address') {
                const abisPath = path.join(__dirname, '../contracts/abis');

                if (fs.existsSync(path.join(abisPath, 'TradeExecutor.json'))) {
                    const tradeExecutorABI = JSON.parse(
                        fs.readFileSync(path.join(abisPath, 'TradeExecutor.json'), 'utf8')
                    );

                    this.tradeExecutorContract = new ethers.Contract(
                        somniaConfig.tradeExecutorAddress,
                        tradeExecutorABI,
                        this.wallet
                    );
                    console.log(`✅ TradeExecutor contract connected: ${somniaConfig.tradeExecutorAddress}`);
                } else {
                    console.warn('⚠️ TradeExecutor ABI not found. Run: npm run compile:contracts');
                }
            } else {
                console.warn('⚠️ TRADE_EXECUTOR_ADDRESS not set. Skipping contract initialization.');
            }

            this.isConnected = true;
            return {
                success: true,
                wallet: this.wallet.address
            };

        } catch (error) {
            console.error('❌ Blockchain connection failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async submitSignal(signal) {
        if (!this.signalStorageContract) {
            console.warn('⚠️ SignalStorage contract not initialized - skipping on-chain submission');
            return {
                success: false,
                error: 'Contract not initialized'
            };
        }

        try {
            console.log(`📤 Submitting signal to blockchain: ${signal.action} ${signal.coin}`);

            const tx = await this.signalStorageContract.submitSignal(
                signal.coin,
                signal.action,
                Math.floor(signal.confidence * 100),
                Math.floor(signal.entryPoint || 0),
                Math.floor(signal.stopLoss || 0),
                Math.floor(signal.takeProfit || 0),
                signal.reasoning || ''
            );

            console.log(`⏳ Transaction sent: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`✅ Signal submitted on-chain! Block: ${receipt.blockNumber}`);

            return {
                success: true,
                txHash: tx.hash,
                blockNumber: receipt.blockNumber
            };

        } catch (error) {
            console.error('❌ Failed to submit signal:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async recordSentiment(coin, sentiment) {
        if (!this.signalStorageContract) {
            return {
                success: false,
                error: 'Contract not initialized'
            };
        }

        try {
            const tx = await this.signalStorageContract.recordSentiment(coin, sentiment);
            const receipt = await tx.wait();

            console.log(`📊 Sentiment recorded on-chain: ${coin} - ${sentiment}`);

            return {
                success: true,
                txHash: tx.hash,
                blockNumber: receipt.blockNumber
            };

        } catch (error) {
            console.error('❌ Failed to record sentiment:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async executeTrade(symbol, side, amount, price) {
        if (!this.tradeExecutorContract) {
            console.warn('⚠️ TradeExecutor contract not initialized - skipping on-chain execution');
            return {
                success: false,
                error: 'Contract not initialized'
            };
        }

        try {
            console.log(`🔄 Executing trade on-chain: ${side} ${symbol}`);

            const tx = await this.tradeExecutorContract.executeTrade(
                symbol,
                side,
                Math.floor(amount * 1e6), // Convert to wei-like format
                Math.floor(price * 1e2)
            );

            const receipt = await tx.wait();
            console.log(`✅ Trade executed on-chain! Block: ${receipt.blockNumber}`);

            return {
                success: true,
                txHash: tx.hash,
                blockNumber: receipt.blockNumber
            };

        } catch (error) {
            console.error('❌ Failed to execute trade:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async recordRiskAlert(symbol, riskLevel, message) {
        if (!this.tradeExecutorContract) {
            return {
                success: false,
                error: 'Contract not initialized'
            };
        }

        try {
            const tx = await this.tradeExecutorContract.recordRiskAlert(
                symbol,
                riskLevel,
                message
            );

            await tx.wait();
            console.log(`⚠️ Risk alert recorded on-chain: ${symbol} - ${riskLevel}`);

            return {
                success: true
            };

        } catch (error) {
            console.error('❌ Failed to record risk alert:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getSignalHistory(coin) {
        if (!this.signalStorageContract) {
            return [];
        }

        try {
            const signals = await this.signalStorageContract.getSignalsByCoin(coin);
            return signals;
        } catch (error) {
            console.error('❌ Failed to get signal history:', error.message);
            return [];
        }
    }

    getStatus() {
        return {
            isConnected: this.isConnected,
            walletAddress: this.wallet?.address || null,
            hasSignalStorage: !!this.signalStorageContract,
            hasTradeExecutor: !!this.tradeExecutorContract
        };
    }
}

export default new BlockchainConnector();