require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    networks: {
        somnia: {
            url: process.env.SOMNIA_RPC_URL || "https://dream-rpc.somnia.network",
            chainId: parseInt(process.env.SOMNIA_CHAIN_ID || "50311"),
            accounts: process.env.SOMNIA_PRIVATE_KEY ? [process.env.SOMNIA_PRIVATE_KEY] : [],
            gas: "auto",
            gasPrice: "auto"
        },
        hardhat: {
            chainId: 31337
        }
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    }
};