// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DAOVoting
 * @dev DAO governance for AI signal validation
 */
contract DAOVoting {
    struct Proposal {
        uint256 id;
        uint256 signalId;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 startTime;
        uint256 endTime;
        bool executed;
        address proposer;
        mapping(address => bool) hasVoted;
    }

    uint256 public proposalCount;
    uint256 public votingPeriod = 3 days;
    uint256 public minQuorum = 10; // Minimum votes needed

    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256) public votingPower;

    event ProposalCreated(
        uint256 indexed proposalId,
        uint256 signalId,
        string description,
        address proposer
    );

    event VoteCast(
        uint256 indexed proposalId,
        address voter,
        bool support,
        uint256 weight
    );

    event ProposalExecuted(uint256 indexed proposalId, bool approved);

    /**
     * @dev Create a new proposal for signal validation
     */
    function createProposal(
        uint256 _signalId,
        string memory _description
    ) external returns (uint256) {
        require(bytes(_description).length > 0, "Description required");

        proposalCount++;
        Proposal storage proposal = proposals[proposalCount];

        proposal.id = proposalCount;
        proposal.signalId = _signalId;
        proposal.description = _description;
        proposal.startTime = block.timestamp;
        proposal.endTime = block.timestamp + votingPeriod;
        proposal.proposer = msg.sender;

        emit ProposalCreated(
            proposalCount,
            _signalId,
            _description,
            msg.sender
        );

        return proposalCount;
    }

    /**
     * @dev Vote on a proposal
     */
    function vote(uint256 _proposalId, bool _support) external {
        Proposal storage proposal = proposals[_proposalId];

        require(block.timestamp < proposal.endTime, "Voting ended");
        require(!proposal.hasVoted[msg.sender], "Already voted");
        require(
            _proposalId > 0 && _proposalId <= proposalCount,
            "Invalid proposal"
        );

        uint256 weight = votingPower[msg.sender] > 0
            ? votingPower[msg.sender]
            : 1;

        proposal.hasVoted[msg.sender] = true;

        if (_support) {
            proposal.votesFor += weight;
        } else {
            proposal.votesAgainst += weight;
        }

        emit VoteCast(_proposalId, msg.sender, _support, weight);
    }

    /**
     * @dev Execute proposal if passed
     */
    function executeProposal(uint256 _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];

        require(block.timestamp >= proposal.endTime, "Voting not ended");
        require(!proposal.executed, "Already executed");
        require(
            _proposalId > 0 && _proposalId <= proposalCount,
            "Invalid proposal"
        );

        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        require(totalVotes >= minQuorum, "Quorum not reached");

        proposal.executed = true;
        bool approved = proposal.votesFor > proposal.votesAgainst;

        emit ProposalExecuted(_proposalId, approved);
    }

    /**
     * @dev Set voting power for an address
     */
    function setVotingPower(address _voter, uint256 _power) external {
        votingPower[_voter] = _power;
    }

    /**
     * @dev Get proposal details
     */
    function getProposal(
        uint256 _proposalId
    )
        external
        view
        returns (
            uint256 id,
            uint256 signalId,
            string memory description,
            uint256 votesFor,
            uint256 votesAgainst,
            uint256 endTime,
            bool executed
        )
    {
        Proposal storage p = proposals[_proposalId];
        return (
            p.id,
            p.signalId,
            p.description,
            p.votesFor,
            p.votesAgainst,
            p.endTime,
            p.executed
        );
    }

    /**
     * @dev Check if address has voted
     */
    function hasVoted(
        uint256 _proposalId,
        address _voter
    ) external view returns (bool) {
        return proposals[_proposalId].hasVoted[_voter];
    }
}
