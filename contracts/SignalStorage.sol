// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SignalStorage
 * @dev Store AI trading signals on Somnia blockchain
 */
contract SignalStorage {
    struct Signal {
        uint256 id;
        string symbol;
        string action; // BUY, SELL, HOLD
        uint256 confidence; // 0-100
        uint256 entryPoint; // Price in wei
        uint256 stopLoss;
        uint256 takeProfit;
        uint256 timestamp;
        address submitter;
        bool executed;
    }

    struct Sentiment {
        string symbol;
        string sentiment; // BULLISH, BEARISH, NEUTRAL
        uint256 score; // 0-100
        uint256 timestamp;
    }

    uint256 public signalCount;
    uint256 public sentimentCount;

    mapping(uint256 => Signal) public signals;
    mapping(uint256 => Sentiment) public sentiments;
    mapping(address => uint256[]) public userSignals;

    event NewSignal(
        uint256 indexed signalId,
        string symbol,
        string action,
        uint256 confidence,
        address submitter
    );

    event SignalExecuted(uint256 indexed signalId, uint256 timestamp);

    event SentimentRecorded(
        uint256 indexed sentimentId,
        string symbol,
        string sentiment,
        uint256 score
    );

    /**
     * @dev Submit a new trading signal
     */
    function submitSignal(
        string memory _symbol,
        string memory _action,
        uint256 _confidence,
        uint256 _entryPoint,
        uint256 _stopLoss,
        uint256 _takeProfit
    ) external returns (uint256) {
        require(_confidence <= 100, "Confidence must be <= 100");
        require(bytes(_symbol).length > 0, "Symbol required");
        require(bytes(_action).length > 0, "Action required");

        signalCount++;

        signals[signalCount] = Signal({
            id: signalCount,
            symbol: _symbol,
            action: _action,
            confidence: _confidence,
            entryPoint: _entryPoint,
            stopLoss: _stopLoss,
            takeProfit: _takeProfit,
            timestamp: block.timestamp,
            submitter: msg.sender,
            executed: false
        });

        userSignals[msg.sender].push(signalCount);

        emit NewSignal(signalCount, _symbol, _action, _confidence, msg.sender);

        return signalCount;
    }

    /**
     * @dev Record market sentiment
     */
    function recordSentiment(
        string memory _symbol,
        string memory _sentiment,
        uint256 _score
    ) external returns (uint256) {
        require(_score <= 100, "Score must be <= 100");

        sentimentCount++;

        sentiments[sentimentCount] = Sentiment({
            symbol: _symbol,
            sentiment: _sentiment,
            score: _score,
            timestamp: block.timestamp
        });

        emit SentimentRecorded(sentimentCount, _symbol, _sentiment, _score);

        return sentimentCount;
    }

    /**
     * @dev Mark signal as executed
     */
    function markSignalExecuted(uint256 _signalId) external {
        require(_signalId > 0 && _signalId <= signalCount, "Invalid signal ID");
        require(signals[_signalId].submitter == msg.sender, "Not signal owner");

        signals[_signalId].executed = true;

        emit SignalExecuted(_signalId, block.timestamp);
    }

    /**
     * @dev Get signal by ID
     */
    function getSignal(
        uint256 _signalId
    ) external view returns (Signal memory) {
        require(_signalId > 0 && _signalId <= signalCount, "Invalid signal ID");
        return signals[_signalId];
    }

    /**
     * @dev Get user's signals
     */
    function getUserSignals(
        address _user
    ) external view returns (uint256[] memory) {
        return userSignals[_user];
    }

    /**
     * @dev Get latest signals (last N)
     */
    function getLatestSignals(
        uint256 _count
    ) external view returns (Signal[] memory) {
        uint256 count = _count > signalCount ? signalCount : _count;
        Signal[] memory latestSignals = new Signal[](count);

        for (uint256 i = 0; i < count; i++) {
            latestSignals[i] = signals[signalCount - i];
        }

        return latestSignals;
    }

    /**
     * @dev Get sentiment by ID
     */
    function getSentiment(
        uint256 _sentimentId
    ) external view returns (Sentiment memory) {
        require(
            _sentimentId > 0 && _sentimentId <= sentimentCount,
            "Invalid sentiment ID"
        );
        return sentiments[_sentimentId];
    }
}
