// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BountyEscrow
/// @notice Holds native ETH in escrow for AgentColony bounties on Base L2.
///         The owner (treasury / company multisig) can release funds to a
///         recipient on resolution, or refund to the original depositor on
///         failure / expiry.
contract BountyEscrow {
    struct Escrow {
        address depositor;
        uint256 amount;
        bool released;
        bool refunded;
    }

    /// @dev bountyId (bytes32-encoded UUID) → escrow record
    mapping(bytes32 => Escrow) private _escrows;

    address public owner;

    event EscrowDeposited(bytes32 indexed bountyId, address indexed depositor, uint256 amount);
    event EscrowReleased(bytes32 indexed bountyId, address indexed recipient, uint256 amount);
    event EscrowRefunded(bytes32 indexed bountyId, address indexed depositor, uint256 amount);

    error NotOwner();
    error AlreadySettled(bytes32 bountyId);
    error NotFound(bytes32 bountyId);
    error AlreadyDeposited(bytes32 bountyId);
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    /// @notice Deposit ETH for a bounty. Must send exactly the bounty amount.
    /// @param bountyId bytes32-encoded UUID of the bounty
    function depositEscrow(bytes32 bountyId) external payable {
        if (_escrows[bountyId].depositor != address(0)) revert AlreadyDeposited(bountyId);
        require(msg.value > 0, "BountyEscrow: zero value");
        _escrows[bountyId] = Escrow({
            depositor: msg.sender,
            amount: msg.value,
            released: false,
            refunded: false
        });
        emit EscrowDeposited(bountyId, msg.sender, msg.value);
    }

    /// @notice Release escrowed funds to a recipient on bounty resolution.
    /// @param bountyId bytes32-encoded UUID of the bounty
    /// @param recipient Address to receive the funds
    function releaseEscrow(bytes32 bountyId, address payable recipient) external onlyOwner {
        Escrow storage e = _escrows[bountyId];
        if (e.depositor == address(0)) revert NotFound(bountyId);
        if (e.released || e.refunded) revert AlreadySettled(bountyId);
        e.released = true;
        (bool ok, ) = recipient.call{value: e.amount}("");
        if (!ok) revert TransferFailed();
        emit EscrowReleased(bountyId, recipient, e.amount);
    }

    /// @notice Refund escrowed funds back to the depositor on failure or expiry.
    /// @param bountyId bytes32-encoded UUID of the bounty
    function refundEscrow(bytes32 bountyId) external onlyOwner {
        Escrow storage e = _escrows[bountyId];
        if (e.depositor == address(0)) revert NotFound(bountyId);
        if (e.released || e.refunded) revert AlreadySettled(bountyId);
        e.refunded = true;
        (bool ok, ) = payable(e.depositor).call{value: e.amount}("");
        if (!ok) revert TransferFailed();
        emit EscrowRefunded(bountyId, e.depositor, e.amount);
    }

    /// @notice Read the escrow state for a bounty.
    function getEscrow(bytes32 bountyId)
        external
        view
        returns (address depositor, uint256 amount, bool released, bool refunded)
    {
        Escrow storage e = _escrows[bountyId];
        return (e.depositor, e.amount, e.released, e.refunded);
    }

    /// @notice Transfer ownership (e.g. to a newly deployed treasury multisig).
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
