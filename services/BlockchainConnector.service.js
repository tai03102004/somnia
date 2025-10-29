import {
    ethers
} from 'ethers';
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';
import {
    fileURLToPath
} from 'url';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

class BlockchainConnector extends EventEmitter {
    constructor() {
        super();
        this.provider = null;
        this.wallet = null;
        this.contracts = {};
        this.isConnected = false;
    }

    loadABI(contractName) {
        const abiPath = path.join(__dirname, `../contracts/abis/${contractName}.json`);
        if (fs.existsSync(abiPath)) {
            return JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        }
        console.warn(`⚠️ ABI not found for ${contractName}`);
        return [];
    }

    async initialize() {
        try {
            console.log('🔗 Initializing Blockchain Connector...');

            const rpcUrl = process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network';
            const chainId = parseInt(process.env.SOMNIA_CHAIN_ID || '50311');

            this.provider = new ethers.JsonRpcProvider(rpcUrl, {
                name: 'somnia-testnet',
                chainId: chainId
            });

            this.wallet = new ethers.Wallet(
                process.env.SOMNIA_PRIVATE_KEY || process.env.PRIVATE_KEY,
                this.provider
            );

            console.log(`💼 Wallet: ${this.wallet.address}`);

            // Load ABIs from files
            const signalStorageABI = this.loadABI('SignalStorage');
            const tradeExecutorABI = this.loadABI('TradeExecutor');
            const daoVotingABI = this.loadABI('DAOVoting');
            const rewardTokenABI = this.loadABI('RewardToken');

            // Initialize contracts
            if (process.env.SIGNAL_STORAGE_ADDRESS && signalStorageABI.length > 0) {
                this.contracts.signalStorage = new ethers.Contract(
                    process.env.SIGNAL_STORAGE_ADDRESS,
                    signalStorageABI,
                    this.wallet
                );
                console.log('✅ SignalStorage contract loaded');
            }

            if (process.env.TRADE_EXECUTOR_ADDRESS && tradeExecutorABI.length > 0) {
                this.contracts.tradeExecutor = new ethers.Contract(
                    process.env.TRADE_EXECUTOR_ADDRESS,
                    tradeExecutorABI,
                    this.wallet
                );
                console.log('✅ TradeExecutor contract loaded');
            }

            if (process.env.DAO_VOTING_ADDRESS && daoVotingABI.length > 0) {
                this.contracts.daoVoting = new ethers.Contract(
                    process.env.DAO_VOTING_ADDRESS,
                    daoVotingABI,
                    this.wallet
                );
                console.log('✅ DAOVoting contract loaded');
            }

            if (process.env.REWARD_TOKEN_ADDRESS && rewardTokenABI.length > 0) {
                this.contracts.rewardToken = new ethers.Contract(
                    process.env.REWARD_TOKEN_ADDRESS,
                    rewardTokenABI,
                    this.wallet
                );
                console.log('✅ RewardToken contract loaded');
            }

            this.isConnected = true;
            this.setupEventListeners();

            return {
                success: true,
                wallet: this.wallet.address,
                contracts: Object.keys(this.contracts)
            };
        } catch (error) {
            console.error('❌ Blockchain initialization failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    setupEventListeners() {
        // Listen to NewSignal events
        this.contracts.signalStorage.on('NewSignal', (signalId, symbol, action, confidence, event) => {
            console.log(`📡 NewSignal event: ${signalId} - ${symbol} ${action}`);
            this.emit('newSignalOnChain', {
                signalId: signalId.toString(),
                symbol,
                action,
                confidence: Number(confidence) / 100,
                blockNumber: event.log.blockNumber
            });
        });

        // Listen to TradeExecuted events
        if (this.contracts.tradeExecutor) {
            this.contracts.tradeExecutor.on('TradeExecuted', (tradeId, symbol, side, amount, event) => {
                console.log(`📡 TradeExecuted: ${tradeId} - ${symbol} ${side}`);
                this.emit('tradeExecutedOnChain', {
                    tradeId: tradeId.toString(),
                    symbol,
                    side,
                    amount: ethers.formatEther(amount),
                    blockNumber: event.log.blockNumber
                });
            });
        }
    }

    async submitSignal(signal) {
        try {
            const {
                coin,
                action,
                confidence,
                entryPoint,
                stopLoss,
                takeProfit
            } = signal;

            const tx = await this.contracts.signalStorage.submitSignal(
                coin,
                action,
                Math.floor(confidence * 100), // Convert to integer percentage
                ethers.parseEther(entryPoint.toString()),
                ethers.parseEther(stopLoss?.toString() || '0'),
                ethers.parseEther(takeProfit?.toString() || '0')
            );

            const receipt = await tx.wait();
            console.log(`✅ Signal submitted on-chain: ${receipt.hash}`);

            return {
                success: true,
                txHash: receipt.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            console.error('❌ Submit signal failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async executeTrade(trade) {
        try {
            const {
                symbol,
                side,
                amount
            } = trade;

            const tx = await this.contracts.tradeExecutor.executeTrade(
                symbol,
                side,
                ethers.parseEther(amount.toString())
            );

            const receipt = await tx.wait();
            console.log(`✅ Trade executed on-chain: ${receipt.hash}`);

            return {
                success: true,
                txHash: receipt.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            console.error('❌ Execute trade failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async recordSentiment(symbol, sentiment, score) {
        try {
            // Optional: if you have a sentiment recording function
            const tx = await this.contracts.signalStorage.recordSentiment(
                symbol,
                sentiment,
                Math.floor(score * 100)
            );

            const receipt = await tx.wait();
            return {
                success: true,
                txHash: receipt.hash
            };
        } catch (error) {
            console.error('❌ Record sentiment failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async createVotingProposal(signalId, description) {
        try {
            if (!this.contracts.daoVoting) {
                throw new Error('DAO Voting contract not initialized');
            }

            const tx = await this.contracts.daoVoting.createProposal(signalId, description);
            const receipt = await tx.wait();

            console.log(`✅ Proposal created: ${receipt.hash}`);
            return {
                success: true,
                txHash: receipt.hash,
                proposalId: signalId
            };
        } catch (error) {
            console.error('❌ Create proposal failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async voteOnSignal(proposalId, support) {
        try {
            if (!this.contracts.daoVoting) {
                throw new Error('DAO Voting contract not initialized');
            }

            const tx = await this.contracts.daoVoting.vote(proposalId, support);
            const receipt = await tx.wait();

            console.log(`✅ Vote cast: ${receipt.hash}`);
            return {
                success: true,
                txHash: receipt.hash
            };
        } catch (error) {
            console.error('❌ Vote failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async rewardUser(userAddress, amount) {
        try {
            if (!this.contracts.rewardToken) {
                throw new Error('Reward token contract not initialized');
            }

            const tx = await this.contracts.rewardToken.transfer(
                userAddress,
                ethers.parseEther(amount.toString())
            );
            const receipt = await tx.wait();

            console.log(`✅ Reward sent: ${receipt.hash}`);
            return {
                success: true,
                txHash: receipt.hash
            };
        } catch (error) {
            console.error('❌ Reward failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getSignalById(signalId) {
        try {
            const signal = await this.contracts.signalStorage.getSignal(signalId);
            return {
                success: true,
                data: {
                    symbol: signal.symbol,
                    action: signal.action,
                    confidence: Number(signal.confidence) / 100,
                    timestamp: Number(signal.timestamp)
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    getStatus() {
        return {
            isConnected: this.isConnected,
            network: this.provider?.network?.name,
            address: this.wallet?.address,
            contracts: Object.keys(this.contracts)
        };
    }
}

export default new BlockchainConnector();