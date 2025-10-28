import {
    ethers
} from 'ethers';
import fs from 'fs';
import path from 'path';
import {
    fileURLToPath
} from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

async function deployContracts() {
    try {
        console.log('🚀 Deploying contracts to Somnia Testnet...\n');

        // Check environment variables
        if (!process.env.SOMNIA_PRIVATE_KEY) {
            throw new Error('SOMNIA_PRIVATE_KEY not set in .env file');
        }

        const rpcUrl = process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network';
        const chainId = parseInt(process.env.SOMNIA_CHAIN_ID || '50311');

        // ✨ FIX: Create network object without ENS
        const network = {
            name: 'somnia-testnet',
            chainId: chainId
        };

        // Initialize provider correctly for ethers v6
        const provider = new ethers.JsonRpcProvider(
            rpcUrl,
            new ethers.Network("somnia-testnet", chainId)
        );

        const wallet = new ethers.Wallet(process.env.SOMNIA_PRIVATE_KEY, provider);

        console.log(`💼 Deploying from wallet: ${wallet.address}`);

        const balance = await provider.getBalance(wallet.address);
        console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} STT\n`);

        if (balance === 0n) {
            console.warn('⚠️  WARNING: Wallet has zero balance!');
            console.log('Please get testnet tokens from Somnia faucet first.');
            console.log('Visit: https://somnia.network/faucet');
            return;
        }


        // Load compiled contracts
        const artifactsPath = path.join(__dirname, '../artifacts/contracts');

        // Deploy SignalStorage
        console.log('📝 Deploying SignalStorage...');
        const SignalStorageArtifact = JSON.parse(
            fs.readFileSync(path.join(artifactsPath, 'SignalStorage.sol/SignalStorage.json'))
        );
        const SignalStorageFactory = new ethers.ContractFactory(
            SignalStorageArtifact.abi,
            SignalStorageArtifact.bytecode,
            wallet
        );
        const signalStorage = await SignalStorageFactory.deploy();
        await signalStorage.waitForDeployment();
        const signalStorageAddress = await signalStorage.getAddress();
        console.log(`✅ SignalStorage deployed at: ${signalStorageAddress}\n`);

        // Deploy TradeExecutor
        console.log('📝 Deploying TradeExecutor...');
        const TradeExecutorArtifact = JSON.parse(
            fs.readFileSync(path.join(artifactsPath, 'TradeExecutor.sol/TradeExecutor.json'))
        );
        const TradeExecutorFactory = new ethers.ContractFactory(
            TradeExecutorArtifact.abi,
            TradeExecutorArtifact.bytecode,
            wallet
        );
        const tradeExecutor = await TradeExecutorFactory.deploy();
        await tradeExecutor.waitForDeployment();
        const tradeExecutorAddress = await tradeExecutor.getAddress();
        console.log(`✅ TradeExecutor deployed at: ${tradeExecutorAddress}\n`);

        // Save deployment info
        const deploymentInfo = {
            network: 'somnia-testnet',
            chainId: chainId,
            deployer: wallet.address,
            contracts: {
                signalStorage: signalStorageAddress,
                tradeExecutor: tradeExecutorAddress
            },
            timestamp: new Date().toISOString(),
            explorerUrls: {
                signalStorage: `https://somnia-devnet.socialscan.io/address/${signalStorageAddress}`,
                tradeExecutor: `https://somnia-devnet.socialscan.io/address/${tradeExecutorAddress}`
            }
        };

        const deploymentPath = path.join(__dirname, '../contracts/deployed-addresses.json');
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ DEPLOYMENT SUCCESSFUL!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('\n📋 Contract Addresses:');
        console.log(`   SignalStorage: ${signalStorageAddress}`);
        console.log(`   TradeExecutor: ${tradeExecutorAddress}`);
        console.log('\n🔗 Explorer Links:');
        console.log(`   SignalStorage: ${deploymentInfo.explorerUrls.signalStorage}`);
        console.log(`   TradeExecutor: ${deploymentInfo.explorerUrls.tradeExecutor}`);
        console.log('\n📝 Next Steps:');
        console.log('1. Update your .env file with these addresses:');
        console.log(`   SIGNAL_STORAGE_ADDRESS=${signalStorageAddress}`);
        console.log(`   TRADE_EXECUTOR_ADDRESS=${tradeExecutorAddress}`);
        console.log('2. Verify contracts on Somnia Explorer (optional)');
        console.log('3. Start the AI Agent system: npm start');
        console.log('═══════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        if (error.code) {
            console.error('Error code:', error.code);
        }
        process.exit(1);
    }
}

deployContracts();