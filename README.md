# Crypto AI Trading Bot với Somnia Blockchain

## 🚀 Hướng dẫn Setup và Deploy

### 1. Xóa dữ liệu cũ (nếu cần)

```bash
# Xóa compiled contracts cũ
rm -rf artifacts cache

# Xóa deployed addresses cũ (optional)
rm -f contracts/deployed-addresses.json

# Xóa ABIs cũ
rm -rf contracts/abis
mkdir -p contracts/abis
```

### 2. Cài đặt dependencies

```bash
npm install
```

### 3. Cấu hình .env

Tạo file `.env` với nội dung:

```bash
# Somnia Blockchain
SOMNIA_RPC_URL=https://dream-rpc.somnia.network
SOMNIA_CHAIN_ID=50311
SOMNIA_PRIVATE_KEY=your_private_key_here

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_token
TELEGRAM_CHAT_ID=your_chat_id

# AI
GEMINI=your_gemini_api_key
GEMINI_MODEL=gemini-pro
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta

# Binance
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_secret
```

### 4. Compile Smart Contracts

```bash
npm run compile:contracts
```

**Output:**

```
🔨 Compiling smart contracts with Hardhat...
✅ SignalStorage ABI exported
✅ TradeExecutor ABI exported
✅ DAOVoting ABI exported
✅ RewardToken ABI exported
```

### 5. Deploy Smart Contracts

```bash
npm run deploy:contracts
```

**Output:**

```
🚀 Deploying ALL contracts to Somnia Testnet...
💼 Deploying from: 0x...
💰 Balance: 10.0 STT

📝 Deploying SignalStorage...
✅ SignalStorage: 0x123...

📝 Deploying TradeExecutor...
✅ TradeExecutor: 0x456...

📝 Deploying DAOVoting...
✅ DAOVoting: 0x789...

📝 Deploying RewardToken...
✅ RewardToken: 0xabc...

✅ ALL CONTRACTS DEPLOYED SUCCESSFULLY!
✅ .env file updated automatically!
```

### 6. Khởi động hệ thống

```bash
npm start
```

**Output:**

```
🚀 Initializing Agent Orchestrator with Blockchain...
✅ Connected to Somnia: 0x...
✅ SignalStorage contract loaded
✅ TradeExecutor contract loaded
✅ DAOVoting contract loaded
✅ RewardToken contract loaded
✅ All agents initialized and running
```

---

## 📡 API Endpoints

### Health Check

```bash
curl http://localhost:3000/api/health
```

### Market Status

```bash
curl http://localhost:3000/api/market/status
```

### Trading Signals

```bash
curl http://localhost:3000/api/market/signals
```

### Blockchain Status

```bash
curl http://localhost:3000/api/blockchain/status
```

### Submit Signal (POST)

```bash
curl -X POST http://localhost:3000/api/blockchain/submit-signal \
  -H "Content-Type: application/json" \
  -d '{
    "coin": "bitcoin",
    "action": "BUY",
    "confidence": 0.85,
    "entryPoint": 95000,
    "stopLoss": 93000,
    "takeProfit": 98000
  }'
```

### Create DAO Proposal (POST)

```bash
curl -X POST http://localhost:3000/api/dao/create-proposal \
  -H "Content-Type: application/json" \
  -d '{
    "signalId": 1,
    "description": "Validate BTC BUY signal with 85% confidence"
  }'
```

### Vote on Proposal (POST)

```bash
curl -X POST http://localhost:3000/api/dao/vote \
  -H "Content-Type: application/json" \
  -d '{
    "proposalId": 1,
    "support": true
  }'
```

### Distribute Rewards (POST)

```bash
curl -X POST http://localhost:3000/api/rewards/distribute \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "amount": 100
  }'
```

---

## 🔍 Verify Contracts on Somnia Explorer

1. Truy cập: https://somnia-devnet.socialscan.io
2. Paste contract address
3. Xem transactions và events

---

## 🛠️ Troubleshooting

### Lỗi: "Insufficient balance"

```bash
# Lấy testnet tokens từ faucet
https://somnia.network/faucet
```

### Lỗi: "Contract not initialized"

```bash
# Kiểm tra .env file có đầy đủ addresses
cat .env | grep ADDRESS
```

### Lỗi: "ABI not found"

```bash
# Compile lại contracts
npm run compile:contracts
```

---

## 📊 Architecture

```
┌────────────────────────────────────────┐
│         AI Agents Layer                │
│  (Analysis, Trading, News, Risk)       │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│    BlockchainConnector Service         │
│  - submitSignal()                      │
│  - executeTrade()                      │
│  - createProposal()                    │
│  - rewardUser()                        │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│    Somnia Smart Contracts              │
│  - SignalStorage.sol                   │
│  - TradeExecutor.sol                   │
│  - DAOVoting.sol                       │
│  - RewardToken.sol                     │
└────────────────────────────────────────┘
```

---

## 📝 Notes

- **Testnet**: Sử dụng Somnia Testnet (ChainID: 50311)
- **Gas**: Transactions miễn phí trên testnet
- **Explorer**: https://somnia-devnet.socialscan.io
- **Faucet**: https://somnia.network/faucet

---

## 🎯 Next Steps

1. ✅ Deploy contracts
2. ✅ Test API endpoints
3. ✅ Verify on explorer
4. 🔜 Connect frontend
5. 🔜 Mainnet deployment
