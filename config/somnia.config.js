export const somniaConfig = {
    network: {
        name: 'Somnia Testnet',
        rpcUrl: process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network',
        chainId: parseInt(process.env.SOMNIA_CHAIN_ID || '50311'),
        explorer: 'https://somnia-devnet.socialscan.io'
    },
    contracts: {
        signalStorage: process.env.SIGNAL_STORAGE_ADDRESS,
        tradeExecutor: process.env.TRADE_EXECUTOR_ADDRESS
    },
    wallet: {
        privateKey: process.env.SOMNIA_PRIVATE_KEY
    }
};