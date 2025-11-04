// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TradeExecutor
 * @dev Simulate trade execution on Somnia blockchain
 */
contract TradeExecutor {
    struct Trade {
        uint256 id;
        string symbol;
        string side; // BUY or SELL
        uint256 amount; // Amount in wei
        uint256 price; // Execution price
        uint256 timestamp;
        address trader;
        bool isLive;
    }

    uint256 public tradeCount;
    mapping(uint256 => Trade) public trades;
    mapping(address => uint256[]) public userTrades;
    mapping(address => uint256) public totalVolume;

    event TradeExecuted(
        uint256 indexed tradeId,
        string symbol,
        string side,
        uint256 amount,
        address trader
    );

    event TradeFailed(uint256 indexed tradeId, string reason);

    /**
     * @dev Execute a trade
     */
    function executeTrade(
        string memory _symbol,
        string memory _side,
        uint256 _amount
    ) external returns (uint256) {
        require(bytes(_symbol).length > 0, "Symbol required");
        require(bytes(_side).length > 0, "Side required");
        require(_amount > 0, "Amount must be > 0");

        tradeCount++;

        trades[tradeCount] = Trade({
            id: tradeCount,
            symbol: _symbol,
            side: _side,
            amount: _amount,
            price: getCurrentPrice(_symbol),
            timestamp: block.timestamp,
            trader: msg.sender,
            isLive: true
        });

        userTrades[msg.sender].push(tradeCount);
        totalVolume[msg.sender] += _amount;

        emit TradeExecuted(tradeCount, _symbol, _side, _amount, msg.sender);

        return tradeCount;
    }

    /**
     * @dev Get current price (mock function)
     */
    function getCurrentPrice(
        string memory _symbol
    ) public pure returns (uint256) {
        // This is a mock function
        // In production, you'd use Chainlink oracle or similar
        if (keccak256(bytes(_symbol)) == keccak256(bytes("BTCUSDT"))) {
            return 95000 * 1e18;
        } else if (keccak256(bytes(_symbol)) == keccak256(bytes("ETHUSDT"))) {
            return 3500 * 1e18;
        }
        return 1000 * 1e18;
    }

    /**
     * @dev Get trade by ID
     */
    function getTrade(uint256 _tradeId) external view returns (Trade memory) {
        require(_tradeId > 0 && _tradeId <= tradeCount, "Invalid trade ID");
        return trades[_tradeId];
    }

    /**
     * @dev Get user's trades
     */
    function getUserTrades(
        address _user
    ) external view returns (uint256[] memory) {
        return userTrades[_user];
    }

    /**
     * @dev Get user's total volume
     */
    function getUserVolume(address _user) external view returns (uint256) {
        return totalVolume[_user];
    }

    /**
     * @dev Get latest trades
     */
    function getLatestTrades(
        uint256 _count
    ) external view returns (Trade[] memory) {
        uint256 count = _count > tradeCount ? tradeCount : _count;
        Trade[] memory latestTrades = new Trade[](count);

        for (uint256 i = 0; i < count; i++) {
            latestTrades[i] = trades[tradeCount - i];
        }

        return latestTrades;
    }
}
