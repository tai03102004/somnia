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
        this.isEnabled = true;
    }

    loadABI(contractName) {
        try {
            const abiPath = path.join(__dirname, `../contracts/abis/${contractName}.json`);
            if (fs.existsSync(abiPath)) {
                return JSON.parse(fs.readFileSync(abiPath, 'utf8'));
            }
        } catch (error) {
            console.warn(`⚠️ Failed to load ABI for ${contractName}`);
        }
        return [];
    }

    async initialize() {
        try {
            console.log('🔗 Attempting blockchain connection...');

            const rpcUrl = process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network';
            const chainId = parseInt(process.env.SOMNIA_CHAIN_ID || '50312');

            this.provider = new ethers.JsonRpcProvider(rpcUrl, {
                name: 'somnia-testnet',
                chainId: chainId
            });

            // Test connection with timeout
            const testPromise = this.provider.getNetwork();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout')), 15000)
            );

            await Promise.race([testPromise, timeoutPromise]);

            this.wallet = new ethers.Wallet(
                process.env.SOMNIA_PRIVATE_KEY || process.env.PRIVATE_KEY,
                this.provider
            );

            console.log(`💼 Wallet: ${this.wallet.address}`);

            // Load ABIs
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
            this.isEnabled = true;

            return {
                success: true,
                wallet: this.wallet.address,
                contracts: Object.keys(this.contracts)
            };
        } catch (error) {
            console.error('❌ Blockchain connection failed:', error.message);
            console.warn('⚠️ System will continue in OFF-CHAIN mode');

            this.isEnabled = false;
            this.isConnected = false;

            return {
                success: false,
                error: error.message,
                mode: 'OFF-CHAIN'
            };
        }
    }

    async submitSignal(signal) {
        // if (!this.isEnabled || !this.contracts.signalStorage) {
        //     console.log('⚠️ Blockchain disabled - skipping signal submission');
        //     return {
        //         success: false,
        //         error: 'Blockchain not available',
        //         skipped: true
        //     };
        // }

        try {
            const {
                coin,
                action,
                confidence,
                entryPoint,
                stopLoss,
                takeProfit
            } = signal;

            // ✅ FIX: Convert to proper format for smart contract
            const tx = await this.contracts.signalStorage.submitSignal(
                coin.toUpperCase(), // symbol: string
                action.toUpperCase(), // action: string
                Math.floor(confidence * 100), // confidence: uint256 (0-100)
                Math.floor(entryPoint), // entryPoint: uint256 (no wei conversion)
                Math.floor(stopLoss || 0), // stopLoss: uint256
                Math.floor(takeProfit || 0) // takeProfit: uint256
            );

            const receipt = await tx.wait();
            const signalId = await this.contracts.signalStorage.signalCount();

            console.log(`✅ Signal #${signalId} submitted: ${receipt.hash}`);

            return {
                success: true,
                signalId: signalId.toString(),
                txHash: receipt.hash,
                blockNumber: receipt.blockNumber,
                explorerUrl: `https://shannon-explorer.somnia.network/tx/${receipt.hash}`
            };
        } catch (error) {
            console.error('❌ Submit signal failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async executeTrade(trade) {
        // if (!this.isEnabled || !this.contracts.tradeExecutor) {
        //     console.log('⚠️ Blockchain disabled - skipping trade recording');
        //     return {
        //         success: false,
        //         error: 'Blockchain not available',
        //         skipped: true
        //     };
        // }

        // try {
        const {
            symbol,
            side,
            amount
        } = trade;

        // ✅ FIX: Convert to proper format
        const tx = await this.contracts.tradeExecutor.executeTrade(
            symbol.toUpperCase(), // symbol: string
            side.toUpperCase(), // side: string
            Math.floor(amount * 1000000) // amount: uint256 (scaled)
        );

        const receipt = await tx.wait();
        console.log(`✅ Trade executed on-chain: ${receipt.hash}`);

        return {
            success: true,
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber
        };
        // } catch (error) {
        //     console.error('❌ Execute trade failed:', error.message);
        //     return {
        //         success: false,
        //         error: error.message
        //     };
        // }
    }

    async getSignalById(signalId) {
        if (!this.isEnabled || !this.contracts.signalStorage) {
            return {
                success: false,
                error: 'SignalStorage not available'
            };
        }

        try {
            const signal = await this.contracts.signalStorage.getSignal(signalId);

            return {
                success: true,
                data: {
                    id: signalId,
                    symbol: signal.symbol,
                    action: signal.action,
                    confidence: Number(signal.confidence) / 100,
                    entryPoint: Number(signal.entryPoint),
                    stopLoss: Number(signal.stopLoss),
                    takeProfit: Number(signal.takeProfit),
                    timestamp: new Date(Number(signal.timestamp) * 1000).toISOString(),
                    submitter: signal.submitter,
                    executed: signal.executed
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getLatestSignals(limit = 10) {
        if (!this.isEnabled || !this.contracts.signalStorage) {
            return {
                success: false,
                error: 'SignalStorage not available'
            };
        }

        try {
            const totalSignals = await this.contracts.signalStorage.signalCount();
            const count = Math.min(Number(totalSignals), limit);

            const signals = [];
            for (let i = Number(totalSignals); i > Number(totalSignals) - count && i > 0; i--) {
                const signal = await this.getSignalById(i);
                if (signal.success) {
                    signals.push(signal.data);
                }
            }

            return {
                success: true,
                total: Number(totalSignals),
                data: signals
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getMySignals() {
        if (!this.isEnabled || !this.contracts.signalStorage) {
            return {
                success: false,
                error: 'SignalStorage not available'
            };
        }

        try {
            const myAddress = this.wallet.address;
            const signalIds = await this.contracts.signalStorage.getUserSignals(myAddress);

            const signals = [];
            for (const signalId of signalIds) {
                const signal = await this.getSignalById(Number(signalId));
                if (signal.success) {
                    signals.push(signal.data);
                }
            }

            return {
                success: true,
                address: myAddress,
                total: signals.length,
                data: signals
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async createVotingProposal(signalId, description) {
        if (!this.isEnabled || !this.contracts.daoVoting) {
            return {
                success: false,
                error: 'DAO Voting not available'
            };
        }

        try {
            const tx = await this.contracts.daoVoting.createProposal(signalId, description);
            const receipt = await tx.wait();
            return {
                success: true,
                txHash: receipt.hash,
                proposalId: signalId
            };
        } catch (error) {
            console.error('❌ Create proposal failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async voteOnSignal(proposalId, support) {
        if (!this.isEnabled || !this.contracts.daoVoting) {
            return {
                success: false,
                error: 'DAO Voting not available'
            };
        }

        try {
            const tx = await this.contracts.daoVoting.vote(proposalId, support);
            const receipt = await tx.wait();
            return {
                success: true,
                txHash: receipt.hash
            };
        } catch (error) {
            console.error('❌ Vote failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async rewardUser(userAddress, amount) {
        if (!this.isEnabled || !this.contracts.rewardToken) {
            return {
                success: false,
                error: 'Reward token not available'
            };
        }

        try {
            const tx = await this.contracts.rewardToken.transfer(
                userAddress,
                ethers.parseEther(amount.toString())
            );
            const receipt = await tx.wait();
            return {
                success: true,
                txHash: receipt.hash
            };
        } catch (error) {
            console.error('❌ Reward failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getStatus() {
        return {
            isConnected: this.isConnected,
            isEnabled: this.isEnabled,
            mode: this.isEnabled ? 'ON-CHAIN' : 'OFF-CHAIN',
            network: this.provider?.network?.name || 'disconnected',
            address: this.wallet?.address || 'N/A',
            contracts: Object.keys(this.contracts)
        };
    }
}

export default new BlockchainConnector();