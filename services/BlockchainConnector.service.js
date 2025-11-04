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

        this.signalCache = new Map();
        this.tradeCache = new Map();
        this.metrics = {
            totalSignalsSubmitted: 0,
            totalTradesExecuted: 0,
            totalProposalsCreated: 0,
            totalVotesCast: 0,
            totalRewardsDistributed: 0
        };
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
            Math.floor(amount * 1000000) // Scale to 6 decimals
        );

        const receipt = await tx.wait();
        const tradeId = await this.contracts.tradeExecutor.tradeCount();

        this.metrics.totalTradesExecuted++;
            
        console.log(`✅ Trade #${tradeId} executed on-chain: ${receipt.hash}`);

        return {
            success: true,
            tradeId: tradeId.toString(),
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            explorerUrl: `https://somnia-devnet.socialscan.io/tx/${receipt.hash}`
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
        // if (!this.isEnabled || !this.contracts.signalStorage) {
        //     return {
        //         success: false,
        //         error: 'SignalStorage not available'
        //     };
        // }

        try {
            const trade = await this.contracts.tradeExecutor.trades(tradeId);

            return {
                success: true,
                data: {
                    id: tradeId,
                    trader: trade.trader,
                    symbol: trade.symbol,
                    side: trade.side,
                    amount: Number(trade.amount) / 1000000,
                    price: Number(trade.price),
                    timestamp: new Date(Number(trade.timestamp) * 1000).toISOString(),
                    status: trade.status
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
        // if (!this.isEnabled || !this.contracts.signalStorage) {
        //     return {
        //         success: false,
        //         error: 'SignalStorage not available'
        //     };
        // }

        try {
            const address = userAddress || this.wallet.address;
            const tradeIds = await this.contracts.tradeExecutor.userTrades(address);

            const trades = [];
            for (const tradeId of tradeIds) {
                const trade = await this.getTradeById(Number(tradeId));
                if (trade.success) {
                    trades.push(trade.data);
                }
            }

            return {
                success: true,
                address,
                total: trades.length,
                data: trades
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getUserVolume(userAddress = null) {
        if (!this.isEnabled || !this.contracts.tradeExecutor) {
            return { success: false, error: 'TradeExecutor not available' };
        }

        try {
            const address = userAddress || this.wallet.address;
            const volume = await this.contracts.tradeExecutor.totalVolume(address);

            return {
                success: true,
                address,
                totalVolume: Number(volume) / 1000000
            };
        } catch (error) {
            return { success: false, error: error.message };
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
        // if (!this.isEnabled || !this.contracts.daoVoting) {
        //     return {
        //         success: false,
        //         error: 'DAO Voting not available'
        //     };
        // }

        try {
            // Validate signal exists
            const signal = await this.getSignalById(signalId);
            if (!signal.success) {
                throw new Error('Signal not found');
            }

            // Check if signal confidence is in borderline range (60-75%)
            if (signal.data.confidence < 0.6 || signal.data.confidence >= 0.75) {
                throw new Error('Signal confidence must be between 60-75% for DAO voting');
            }

            const tx = await this.contracts.daoVoting.createProposal(
                signalId,
                description || `Vote on ${signal.data.action} signal for ${signal.data.symbol}`
            );

            const receipt = await tx.wait();
            const proposalId = await this.contracts.daoVoting.proposalCount();

            this.metrics.totalProposalsCreated++;

            console.log(`✅ Proposal #${proposalId} created: ${receipt.hash}`);

            return {
                success: true,
                proposalId: proposalId.toString(),
                signalId: signalId.toString(),
                txHash: receipt.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            console.error('❌ Create proposal failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    async getProposal(proposalId) {
        if (!this.isEnabled || !this.contracts.daoVoting) {
            return { success: false, error: 'DAO Voting not available' };
        }

        try {
            const proposal = await this.contracts.daoVoting.proposals(proposalId);

            return {
                success: true,
                data: {
                    id: proposalId,
                    signalId: Number(proposal.signalId),
                    description: proposal.description,
                    votesFor: Number(proposal.votesFor),
                    votesAgainst: Number(proposal.votesAgainst),
                    executed: proposal.executed,
                    startTime: new Date(Number(proposal.startTime) * 1000).toISOString(),
                    endTime: new Date(Number(proposal.endTime) * 1000).toISOString()
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async voteOnSignal(proposalId, support) {
        // if (!this.isEnabled || !this.contracts.daoVoting) {
        //     return {
        //         success: false,
        //         error: 'DAO Voting not available'
        //     };
        // }

        try {
            // Check if user has voting power
            const votingPower = await this.contracts.daoVoting.votingPower(this.wallet.address);
            
            if (Number(votingPower) === 0) {
                throw new Error('No voting power - need to hold reward tokens');
            }

            const tx = await this.contracts.daoVoting.vote(proposalId, support);
            const receipt = await tx.wait();

            this.metrics.totalVotesCast++;

            console.log(`✅ Vote cast on proposal #${proposalId}: ${support ? 'FOR' : 'AGAINST'}`);

            return {
                success: true,
                proposalId: proposalId.toString(),
                support,
                votingPower: Number(votingPower),
                txHash: receipt.hash
            };
        } catch (error) {
            console.error('❌ Vote failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    async getVotingPower(userAddress = null) {
        if (!this.isEnabled || !this.contracts.daoVoting) {
            return { success: false, error: 'DAO Voting not available' };
        }

        try {
            const address = userAddress || this.wallet.address;
            const power = await this.contracts.daoVoting.votingPower(address);

            return {
                success: true,
                address,
                votingPower: Number(power)
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async rewardUser(userAddress, amount, reason = 'Trading performance') {
        // if (!this.isEnabled || !this.contracts.rewardToken) {
        //     return { success: false, error: 'Reward token not available' };
        // }

        try {
            // Check if we have enough tokens to distribute
            const balance = await this.contracts.rewardToken.balanceOf(this.wallet.address);
            const rewardAmount = ethers.parseEther(amount.toString());

            if (balance < rewardAmount) {
                throw new Error('Insufficient reward tokens in treasury');
            }

            // Mint new tokens instead of transfer (if owner)
            const isOwner = await this.contracts.rewardToken.owner() === this.wallet.address;
            
            let tx;
            if (isOwner) {
                tx = await this.contracts.rewardToken.mint(userAddress, rewardAmount);
            } else {
                tx = await this.contracts.rewardToken.transfer(userAddress, rewardAmount);
            }

            const receipt = await tx.wait();

            this.metrics.totalRewardsDistributed += amount;

            console.log(`✅ Rewarded ${amount} ASRT to ${userAddress} - ${reason}`);

            return {
                success: true,
                recipient: userAddress,
                amount,
                reason,
                txHash: receipt.hash
            };
        } catch (error) {
            console.error('❌ Reward failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    async getTokenBalance(userAddress = null) {
        if (!this.isEnabled || !this.contracts.rewardToken) {
            return { success: false, error: 'Reward token not available' };
        }

        try {
            const address = userAddress || this.wallet.address;
            const balance = await this.contracts.rewardToken.balanceOf(address);

            return {
                success: true,
                address,
                balance: ethers.formatEther(balance),
                balanceWei: balance.toString()
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async distributeRewards(recipients) {
        if (!this.isEnabled || !this.contracts.rewardToken) {
            return { success: false, error: 'Reward token not available' };
        }

        const results = [];
        let totalDistributed = 0;

        for (const { address, amount, reason } of recipients) {
            const result = await this.rewardUser(address, amount, reason);
            results.push({ address, ...result });
            
            if (result.success) {
                totalDistributed += amount;
            }
        }

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(`📊 Bulk reward distribution complete: ${successful} success, ${failed} failed`);

        return {
            success: true,
            totalDistributed,
            successful,
            failed,
            details: results
        };
    }

    async retryCachedSubmissions() {
        if (!this.isEnabled) {
            console.log('⚠️ Blockchain still disabled - skipping retry');
            return { success: false, error: 'Blockchain not available' };
        }

        const results = {
            signals: { attempted: 0, successful: 0, failed: 0 },
            trades: { attempted: 0, successful: 0, failed: 0 }
        };

        // Retry signals
        for (const [timestamp, signal] of this.signalCache.entries()) {
            results.signals.attempted++;
            const result = await this.submitSignal(signal);
            
            if (result.success) {
                this.signalCache.delete(timestamp);
                results.signals.successful++;
            } else {
                results.signals.failed++;
            }
        }

        // Retry trades
        for (const [timestamp, trade] of this.tradeCache.entries()) {
            results.trades.attempted++;
            const result = await this.executeTrade(trade);
            
            if (result.success) {
                this.tradeCache.delete(timestamp);
                results.trades.successful++;
            } else {
                results.trades.failed++;
            }
        }

        console.log(`📊 Retry complete: ${results.signals.successful + results.trades.successful} successful submissions`);

        return {
            success: true,
            results
        };
    }

    async getAnalytics() {
        if (!this.isEnabled) {
            return { success: false, error: 'Blockchain not available' };
        }

        try {
            const [
                totalSignals,
                totalTrades,
                totalProposals,
                mySignals,
                myTrades,
                myBalance
            ] = await Promise.all([
                this.contracts.signalStorage?.signalCount() || 0,
                this.contracts.tradeExecutor?.tradeCount() || 0,
                this.contracts.daoVoting?.proposalCount() || 0,
                this.getMySignals(),
                this.getUserTrades(),
                this.getTokenBalance()
            ]);

            return {
                success: true,
                global: {
                    totalSignals: Number(totalSignals),
                    totalTrades: Number(totalTrades),
                    totalProposals: Number(totalProposals)
                },
                user: {
                    signals: mySignals.total || 0,
                    trades: myTrades.total || 0,
                    balance: myBalance.balance || '0'
                },
                metrics: this.metrics
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async recordSentiment(coin, sentiment, score = 0.5) {
        if (!this.signalStorageContract) {
            return {
                success: false,
                error: 'Contract not initialized'
            };
        }

        try {
            console.log(`📊 Recording sentiment: ${coin} - ${sentiment} (${score})`);

            const tx = await this.signalStorageContract.recordSentiment(
                coin,
                sentiment,
                Math.floor(score * 100) // Convert 0-1 to 0-100
            );

            const receipt = await tx.wait();
            console.log(`✅ Sentiment recorded on-chain! Block: ${receipt.blockNumber}`);

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