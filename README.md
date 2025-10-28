# 🚀 Crypto AI Agent - Web3 Trading Platform

A decentralized AI-powered cryptocurrency trading platform built on Somnia Network. Features real-time market analysis, automated trading signals, and on-chain transparency.

![Platform](https://img.shields.io/badge/Platform-Somnia-blue)
![Framework](https://img.shields.io/badge/Framework-Next.js_14-black)
![Web3](https://img.shields.io/badge/Web3-RainbowKit-purple)

## ✨ Features

### 🤖 AI-Powered Trading

- **Real-time Market Analysis**: Live price monitoring with WebSocket
- **AI Trading Signals**: GPT-4 powered market analysis and predictions
- **Technical Indicators**: RSI, MACD, EMA, Bollinger Bands, Stochastic
- **Auto Trading**: Automated trade execution based on AI signals

### 🔗 Blockchain Integration

- **Somnia Network**: All signals and trades recorded on-chain
- **Wallet Connect**: MetaMask, WalletConnect, and more
- **On-Chain Transparency**: Verifiable AI decisions on blockchain
- **Smart Contracts**: SignalStorage.sol & TradeExecutor.sol

### 📊 Advanced Features

- **Portfolio Management**: Track positions and P&L in real-time
- **Risk Management**: Auto stop-loss and take-profit
- **Telegram Alerts**: Real-time notifications
- **Multi-Agent System**: 6 specialized AI agents working together

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Web3**: Wagmi, RainbowKit, Viem
- **Backend**: Node.js, Express
- **Blockchain**: Somnia Network (Testnet)
- **AI**: OpenRouter API (GPT-4 equivalent)
- **Real-time**: WebSocket (Binance Stream)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- MetaMask or Web3 wallet
- Somnia Testnet tokens ([Get from faucet](https://faucet.somnia.network))

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd Crypto-FE-AI

# Install dependencies
npm install

# Create environment file
cp .env.local.example .env.local

# Update .env.local with your configuration
```

### Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:8081
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

### Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3001](http://localhost:3001)

## 📱 Usage

### 1. Connect Wallet

- Click "Connect Wallet" button in header
- Select MetaMask or your preferred wallet
- Approve connection to Somnia Testnet
- Get testnet tokens if needed

### 2. Dashboard

- View real-time Bitcoin & Ethereum prices
- See AI-generated trading signals
- Monitor portfolio performance
- Check agent status

### 3. Trading

- Review AI signals with confidence scores
- Set stop-loss and take-profit levels
- Execute trades (demo or live)
- Track performance in real-time

### 4. Blockchain

- View on-chain signal history
- Verify trades on Somnia Explorer
- Check smart contract interactions
- Monitor gas usage

## 🏗️ Project Structure

```
Crypto-FE-AI/
├── app/
│   ├── (pages)/
│   │   ├── page.tsx          # Dashboard
│   │   ├── trading/          # Trading interface
│   │   ├── portfolio/        # Portfolio management
│   │   ├── history/          # Trade history
│   │   ├── blockchain/       # On-chain data
│   │   ├── agents/           # Agent monitoring
│   │   └── settings/         # System settings
│   ├── layout.tsx            # Root layout with Web3
│   └── globals.css           # Global styles
├── components/
│   ├── Dashboard.tsx         # Main dashboard
│   ├── Header.tsx            # Header with wallet connect
│   ├── Sidebar.tsx           # Navigation sidebar
│   ├── WalletInfo.tsx        # Wallet information
│   ├── PriceCard.tsx         # Price display
│   ├── TradingSignals.tsx    # AI signals
│   ├── PortfolioOverview.tsx # Portfolio stats
│   ├── AgentStatus.tsx       # Agent monitoring
│   ├── BlockchainInfo.tsx    # Blockchain data
│   └── RecentTrades.tsx      # Trade history
├── providers/
│   └── Web3Provider.tsx      # Web3 configuration
├── lib/
│   └── api.ts                # API client
└── public/                   # Static assets
```

## 🤖 AI Agents

The platform uses 6 specialized agents:

1. **Market Agent**: Real-time price monitoring
2. **Analysis Agent**: AI market analysis & signal generation
3. **Trading Agent**: Automated trade execution
4. **News Agent**: News sentiment analysis
5. **Risk Manager**: Risk assessment & portfolio management
6. **Alert Agent**: Telegram notifications & blockchain events

## 📊 Trading Signals

AI generates signals with:

- **Action**: BUY, SELL, or HOLD
- **Confidence**: 0-100% (75%+ executes)
- **Entry Point**: Suggested entry price
- **Stop Loss**: Auto stop-loss level
- **Take Profit**: Target profit level
- **Reasoning**: AI explanation

## 🔐 Security

- All trades executed through smart contracts
- On-chain verification of AI signals
- No private keys stored
- Non-custodial wallet integration
- Demo mode for testing

## 🌐 Somnia Network

**Network Details:**

- Chain ID: 50312
- RPC: https://dream-rpc.somnia.network
- Explorer: https://somnia-devnet.socialscan.io
- Faucet: https://faucet.somnia.network

**Smart Contracts:**

- SignalStorage: Records AI trading signals
- TradeExecutor: Logs trade executions

## 📈 Roadmap

- [ ] Multi-chain support
- [ ] More AI models integration
- [ ] Social trading features
- [ ] Mobile app
- [ ] Advanced charting
- [ ] Liquidity pool integration

## 🤝 Contributing

This project is part of Somnia AI Hackathon submission.

## 📜 License

MIT License - See LICENSE file for details

## 🔗 Links

- [Frontend Demo](http://localhost:3001)
- [Backend API](http://localhost:3000)
- [Somnia Explorer](https://somnia-devnet.socialscan.io)
- [Documentation](#)

## 💡 Tips

1. **Start with Demo Mode**: Test with virtual balance first
2. **Connect Wallet**: Get testnet STT tokens from faucet
3. **Monitor Signals**: Check AI confidence before trading
4. **Set Stop-Loss**: Always protect your capital
5. **Verify On-Chain**: Check transactions on Somnia Explorer

## 📞 Support

For issues or questions:

- GitHub Issues: [Create Issue](#)
- Telegram: [Join Group](#)
- Email: support@cryptoagent.ai

---

Built with ❤️ for Somnia AI Hackathon
