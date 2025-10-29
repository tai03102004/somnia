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
        console.log('🚀 Deploying ALL contracts to Somnia Testnet...\n');

        if (!process.env.SOMNIA_PRIVATE_KEY) {
            throw new Error('SOMNIA_PRIVATE_KEY not set in .env file');
        }

        const rpcUrl = process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network';
        const chainId = parseInt(process.env.SOMNIA_CHAIN_ID || '50311');

        const provider = new ethers.JsonRpcProvider(rpcUrl, {
            name: 'somnia-testnet',
            chainId: chainId
        });

        const wallet = new ethers.Wallet(process.env.SOMNIA_PRIVATE_KEY, provider);
        console.log(`💼 Deploying from: ${wallet.address}`);

        const balance = await provider.getBalance(wallet.address);
        console.log(`💰 Balance: ${ethers.formatEther(balance)} STT\n`);

        if (balance === 0n) {
            console.warn('⚠️  WARNING: Zero balance! Get testnet tokens first.');
            return;
        }

        const artifactsPath = path.join(__dirname, '../artifacts/contracts');
        const deployedContracts = {};

        // 1. Deploy SignalStorage
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
        deployedContracts.signalStorage = await signalStorage.getAddress();
        console.log(`✅ SignalStorage: ${deployedContracts.signalStorage}\n`);

        // 2. Deploy TradeExecutor
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
        deployedContracts.tradeExecutor = await tradeExecutor.getAddress();
        console.log(`✅ TradeExecutor: ${deployedContracts.tradeExecutor}\n`);

        // 3. Deploy DAOVoting
        console.log('📝 Deploying DAOVoting...');
        const DAOVotingArtifact = JSON.parse(
            fs.readFileSync(path.join(artifactsPath, 'DAOVoting.sol/DAOVoting.json'))
        );
        const DAOVotingFactory = new ethers.ContractFactory(
            DAOVotingArtifact.abi,
            DAOVotingArtifact.bytecode,
            wallet
        );
        const daoVoting = await DAOVotingFactory.deploy();
        await daoVoting.waitForDeployment();
        deployedContracts.daoVoting = await daoVoting.getAddress();
        console.log(`✅ DAOVoting: ${deployedContracts.daoVoting}\n`);

        // 4. Deploy RewardToken
        console.log('📝 Deploying RewardToken...');
        const RewardTokenArtifact = JSON.parse(
            fs.readFileSync(path.join(artifactsPath, 'RewardToken.sol/RewardToken.json'))
        );
        const RewardTokenFactory = new ethers.ContractFactory(
            RewardTokenArtifact.abi,
            RewardTokenArtifact.bytecode,
            wallet
        );
        const rewardToken = await RewardTokenFactory.deploy(1000000); // 1M tokens
        await rewardToken.waitForDeployment();
        deployedContracts.rewardToken = await rewardToken.getAddress();
        console.log(`✅ RewardToken: ${deployedContracts.rewardToken}\n`);

        // Save deployment info
        const deploymentInfo = {
            network: 'somnia-testnet',
            chainId: chainId,
            deployer: wallet.address,
            contracts: deployedContracts,
            timestamp: new Date().toISOString(),
            explorerUrls: {
                signalStorage: `https://somnia-devnet.socialscan.io/address/${deployedContracts.signalStorage}`,
                tradeExecutor: `https://somnia-devnet.socialscan.io/address/${deployedContracts.tradeExecutor}`,
                daoVoting: `https://somnia-devnet.socialscan.io/address/${deployedContracts.daoVoting}`,
                rewardToken: `https://somnia-devnet.socialscan.io/address/${deployedContracts.rewardToken}`
            }
        };

        // Save to JSON
        const deploymentPath = path.join(__dirname, '../contracts/deployed-addresses.json');
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

        // Update .env file
        const envPath = path.join(__dirname, '../.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        // Remove old addresses
        envContent = envContent.replace(/SIGNAL_STORAGE_ADDRESS=.*/g, '');
        envContent = envContent.replace(/TRADE_EXECUTOR_ADDRESS=.*/g, '');
        envContent = envContent.replace(/DAO_VOTING_ADDRESS=.*/g, '');
        envContent = envContent.replace(/REWARD_TOKEN_ADDRESS=.*/g, '');

        // Add new addresses
        const newEnvVars = `
# Smart Contract Addresses (Updated: ${new Date().toISOString()})
SIGNAL_STORAGE_ADDRESS=${deployedContracts.signalStorage}
TRADE_EXECUTOR_ADDRESS=${deployedContracts.tradeExecutor}
DAO_VOTING_ADDRESS=${deployedContracts.daoVoting}
REWARD_TOKEN_ADDRESS=${deployedContracts.rewardToken}
`;

        fs.writeFileSync(envPath, envContent + newEnvVars);

        // Save ABIs
        const abisDir = path.join(__dirname, '../contracts/abis');
        fs.writeFileSync(
            path.join(abisDir, 'SignalStorage.json'),
            JSON.stringify(SignalStorageArtifact.abi, null, 2)
        );
        fs.writeFileSync(
            path.join(abisDir, 'TradeExecutor.json'),
            JSON.stringify(TradeExecutorArtifact.abi, null, 2)
        );
        fs.writeFileSync(
            path.join(abisDir, 'DAOVoting.json'),
            JSON.stringify(DAOVotingArtifact.abi, null, 2)
        );
        fs.writeFileSync(
            path.join(abisDir, 'RewardToken.json'),
            JSON.stringify(RewardTokenArtifact.abi, null, 2)
        );

        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ ALL CONTRACTS DEPLOYED SUCCESSFULLY!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('\n📋 Contract Addresses:');
        console.log(`   SignalStorage:  ${deployedContracts.signalStorage}`);
        console.log(`   TradeExecutor:  ${deployedContracts.tradeExecutor}`);
        console.log(`   DAOVoting:      ${deployedContracts.daoVoting}`);
        console.log(`   RewardToken:    ${deployedContracts.rewardToken}`);
        console.log('\n✅ .env file updated automatically!');
        console.log('✅ ABIs saved to contracts/abis/');
        console.log('\n📝 Next Steps:');
        console.log('1. Restart your Node.js server: npm start');
        console.log('2. Test API endpoints: curl http://localhost:3000/api/health');
        console.log('═══════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        process.exit(1);
    }
}

deployContracts();