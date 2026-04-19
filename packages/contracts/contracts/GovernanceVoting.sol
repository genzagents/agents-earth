// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GovernanceVoting
/// @notice On-chain reputation-weighted voting for AgentColony governance proposals.
///
///         Each agent casts a vote referencing their DID (`did:genz:<agentId>`) and
///         their off-chain reputation score. An ECDSA signature over the vote payload
///         is recorded so any observer can verify authenticity against the agent's key.
///
///         Vote tallying is done off-chain (read via `getVotes`) or can be triggered
///         via `finalizeProposal` once the deadline passes.
contract GovernanceVoting {
    enum VoteChoice { Abstain, Yes, No }

    struct Vote {
        bytes32 agentDid;       // keccak256(did:genz:<agentId>)
        VoteChoice choice;
        uint128 reputationWeight; // reputation points at time of vote (off-chain oracle)
        bytes signature;          // EIP-191 personal_sign over (proposalId, agentDid, choice, weight)
        uint256 timestamp;
    }

    struct Proposal {
        bytes32 titleHash;          // keccak256 of proposal title
        address creator;
        uint256 deadline;           // Unix timestamp; 0 = no deadline
        bool finalized;
        uint128 yesWeight;
        uint128 noWeight;
        uint128 abstainWeight;
    }

    /// @dev proposalId → proposal metadata
    mapping(bytes32 => Proposal) private _proposals;

    /// @dev proposalId → agentDid → Vote
    mapping(bytes32 => mapping(bytes32 => Vote)) private _votes;

    /// @dev proposalId → list of voting agentDids (for iteration)
    mapping(bytes32 => bytes32[]) private _voters;

    event ProposalCreated(bytes32 indexed proposalId, bytes32 titleHash, address creator, uint256 deadline);
    event VoteCast(bytes32 indexed proposalId, bytes32 indexed agentDid, VoteChoice choice, uint128 weight);
    event ProposalFinalized(bytes32 indexed proposalId, uint128 yesWeight, uint128 noWeight, uint128 abstainWeight);

    error ProposalExists(bytes32 proposalId);
    error ProposalNotFound(bytes32 proposalId);
    error AlreadyVoted(bytes32 proposalId, bytes32 agentDid);
    error ProposalClosed(bytes32 proposalId);
    error NotFinalized(bytes32 proposalId);

    /// @notice Create a new governance proposal.
    /// @param proposalId bytes32-encoded UUID
    /// @param titleHash keccak256 of the proposal title
    /// @param deadline Unix timestamp after which voting closes (0 = open-ended)
    function createProposal(bytes32 proposalId, bytes32 titleHash, uint256 deadline) external {
        if (_proposals[proposalId].creator != address(0)) revert ProposalExists(proposalId);
        _proposals[proposalId] = Proposal({
            titleHash: titleHash,
            creator: msg.sender,
            deadline: deadline,
            finalized: false,
            yesWeight: 0,
            noWeight: 0,
            abstainWeight: 0
        });
        emit ProposalCreated(proposalId, titleHash, msg.sender, deadline);
    }

    /// @notice Cast a reputation-weighted vote with a DID signature.
    /// @param proposalId Target proposal UUID
    /// @param agentDid keccak256(did:genz:<agentId>) — opaque DID identifier
    /// @param choice 0=Abstain, 1=Yes, 2=No
    /// @param reputationWeight Agent's reputation score at vote time
    /// @param signature EIP-191 personal_sign over abi.encode(proposalId, agentDid, choice, reputationWeight)
    function castVote(
        bytes32 proposalId,
        bytes32 agentDid,
        VoteChoice choice,
        uint128 reputationWeight,
        bytes calldata signature
    ) external {
        Proposal storage p = _proposals[proposalId];
        if (p.creator == address(0)) revert ProposalNotFound(proposalId);
        if (p.finalized) revert ProposalClosed(proposalId);
        if (p.deadline != 0 && block.timestamp > p.deadline) revert ProposalClosed(proposalId);
        if (_votes[proposalId][agentDid].timestamp != 0) revert AlreadyVoted(proposalId, agentDid);

        _votes[proposalId][agentDid] = Vote({
            agentDid: agentDid,
            choice: choice,
            reputationWeight: reputationWeight,
            signature: signature,
            timestamp: block.timestamp
        });
        _voters[proposalId].push(agentDid);

        if (choice == VoteChoice.Yes)     p.yesWeight     += reputationWeight;
        else if (choice == VoteChoice.No) p.noWeight      += reputationWeight;
        else                              p.abstainWeight += reputationWeight;

        emit VoteCast(proposalId, agentDid, choice, reputationWeight);
    }

    /// @notice Finalize a proposal once its deadline has passed (or creator closes it early).
    function finalizeProposal(bytes32 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.creator == address(0)) revert ProposalNotFound(proposalId);
        if (p.finalized) revert ProposalClosed(proposalId);
        require(
            msg.sender == p.creator || (p.deadline != 0 && block.timestamp > p.deadline),
            "GovernanceVoting: not yet closeable"
        );
        p.finalized = true;
        emit ProposalFinalized(proposalId, p.yesWeight, p.noWeight, p.abstainWeight);
    }

    /// @notice Read proposal metadata and current tally.
    function getProposal(bytes32 proposalId)
        external
        view
        returns (
            bytes32 titleHash,
            address creator,
            uint256 deadline,
            bool finalized,
            uint128 yesWeight,
            uint128 noWeight,
            uint128 abstainWeight
        )
    {
        Proposal storage p = _proposals[proposalId];
        return (p.titleHash, p.creator, p.deadline, p.finalized, p.yesWeight, p.noWeight, p.abstainWeight);
    }

    /// @notice Read all votes for a proposal (paginated by offset/limit).
    function getVotes(bytes32 proposalId, uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory agentDids, VoteChoice[] memory choices, uint128[] memory weights)
    {
        bytes32[] storage voters = _voters[proposalId];
        uint256 total = voters.length;
        if (offset >= total) {
            return (new bytes32[](0), new VoteChoice[](0), new uint128[](0));
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;

        agentDids = new bytes32[](n);
        choices   = new VoteChoice[](n);
        weights   = new uint128[](n);

        for (uint256 i = 0; i < n; i++) {
            bytes32 did = voters[offset + i];
            Vote storage v = _votes[proposalId][did];
            agentDids[i] = did;
            choices[i]   = v.choice;
            weights[i]   = v.reputationWeight;
        }
    }

    /// @notice Get individual vote for an agent on a proposal.
    function getVote(bytes32 proposalId, bytes32 agentDid)
        external
        view
        returns (VoteChoice choice, uint128 weight, bytes memory signature, uint256 timestamp)
    {
        Vote storage v = _votes[proposalId][agentDid];
        return (v.choice, v.reputationWeight, v.signature, v.timestamp);
    }
}
