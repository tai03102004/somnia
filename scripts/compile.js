import {
    execSync
} from 'child_process';
import fs from 'fs';
import path from 'path';
import {
    fileURLToPath
} from 'url';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

async function compileContracts() {
    try {
        console.log('🔨 Compiling smart contracts with Hardhat...\n');

        // Run Hardhat compile
        execSync('npx hardhat compile', {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });

        console.log('\n✅ Compilation successful!\n');

        // Create ABIs directory
        const abisDir = path.join(__dirname, '../contracts/abis');
        if (!fs.existsSync(abisDir)) {
            fs.mkdirSync(abisDir, {
                recursive: true
            });
            console.log('📁 Created contracts/abis directory');
        }

        // Copy ABIs
        const artifactsDir = path.join(__dirname, '../artifacts/contracts');

        // SignalStorage
        const signalStoragePath = path.join(artifactsDir, 'SignalStorage.sol/SignalStorage.json');
        if (fs.existsSync(signalStoragePath)) {
            const artifact = JSON.parse(fs.readFileSync(signalStoragePath, 'utf8'));
            fs.writeFileSync(
                path.join(abisDir, 'SignalStorage.json'),
                JSON.stringify(artifact.abi, null, 2)
            );
            console.log('✅ SignalStorage ABI exported');
        } else {
            console.warn('⚠️  SignalStorage artifact not found');
        }

        // TradeExecutor
        const tradeExecutorPath = path.join(artifactsDir, 'TradeExecutor.sol/TradeExecutor.json');
        if (fs.existsSync(tradeExecutorPath)) {
            const artifact = JSON.parse(fs.readFileSync(tradeExecutorPath, 'utf8'));
            fs.writeFileSync(
                path.join(abisDir, 'TradeExecutor.json'),
                JSON.stringify(artifact.abi, null, 2)
            );
            console.log('✅ TradeExecutor ABI exported');
        } else {
            console.warn('⚠️  TradeExecutor artifact not found');
        }

        console.log('\n✅ All ABIs exported to contracts/abis/');
        console.log('📝 Ready for deployment! Run: npm run deploy:contracts\n');

    } catch (error) {
        console.error('\n❌ Compilation failed:', error.message);
        process.exit(1);
    }
}

compileContracts();