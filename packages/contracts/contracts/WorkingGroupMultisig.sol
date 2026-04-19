// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WorkingGroupWallet
/// @notice Minimal m-of-n multisig wallet for AgentColony working groups on Base L2.
///         Owners submit and confirm transactions; execution requires `threshold` confirmations.
contract WorkingGroupWallet {
    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
    }

    address[] public owners;
    uint256 public threshold;
    Transaction[] public transactions;

    mapping(address => bool) public isOwner;
    mapping(uint256 => mapping(address => bool)) public confirmed;

    event Submitted(uint256 indexed txIndex, address indexed owner, address to, uint256 value);
    event Confirmed(uint256 indexed txIndex, address indexed owner);
    event Executed(uint256 indexed txIndex);
    event Revoked(uint256 indexed txIndex, address indexed owner);

    error NotOwner();
    error AlreadyConfirmed(uint256 txIndex);
    error NotConfirmed(uint256 txIndex);
    error AlreadyExecuted(uint256 txIndex);
    error TxDoesNotExist(uint256 txIndex);
    error ExecutionFailed(uint256 txIndex);
    error InvalidThreshold();

    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner();
        _;
    }

    modifier txExists(uint256 txIndex) {
        if (txIndex >= transactions.length) revert TxDoesNotExist(txIndex);
        _;
    }

    modifier notExecuted(uint256 txIndex) {
        if (transactions[txIndex].executed) revert AlreadyExecuted(txIndex);
        _;
    }

    constructor(address[] memory _owners, uint256 _threshold) {
        if (_threshold == 0 || _threshold > _owners.length) revert InvalidThreshold();
        for (uint256 i = 0; i < _owners.length; i++) {
            address o = _owners[i];
            require(o != address(0), "WorkingGroupWallet: zero owner");
            require(!isOwner[o], "WorkingGroupWallet: duplicate owner");
            isOwner[o] = true;
            owners.push(o);
        }
        threshold = _threshold;
    }

    receive() external payable {}

    /// @notice Submit a transaction for confirmation.
    function submitTransaction(address to, uint256 value, bytes calldata data)
        external
        onlyOwner
        returns (uint256 txIndex)
    {
        txIndex = transactions.length;
        transactions.push(Transaction({ to: to, value: value, data: data, executed: false, confirmations: 0 }));
        emit Submitted(txIndex, msg.sender, to, value);
    }

    /// @notice Confirm a pending transaction.
    function confirmTransaction(uint256 txIndex)
        external
        onlyOwner
        txExists(txIndex)
        notExecuted(txIndex)
    {
        if (confirmed[txIndex][msg.sender]) revert AlreadyConfirmed(txIndex);
        confirmed[txIndex][msg.sender] = true;
        transactions[txIndex].confirmations++;
        emit Confirmed(txIndex, msg.sender);
    }

    /// @notice Execute a transaction once it has enough confirmations.
    function executeTransaction(uint256 txIndex)
        external
        onlyOwner
        txExists(txIndex)
        notExecuted(txIndex)
    {
        Transaction storage t = transactions[txIndex];
        require(t.confirmations >= threshold, "WorkingGroupWallet: not enough confirmations");
        t.executed = true;
        (bool ok, ) = t.to.call{value: t.value}(t.data);
        if (!ok) revert ExecutionFailed(txIndex);
        emit Executed(txIndex);
    }

    /// @notice Revoke your confirmation for a pending transaction.
    function revokeConfirmation(uint256 txIndex)
        external
        onlyOwner
        txExists(txIndex)
        notExecuted(txIndex)
    {
        if (!confirmed[txIndex][msg.sender]) revert NotConfirmed(txIndex);
        confirmed[txIndex][msg.sender] = false;
        transactions[txIndex].confirmations--;
        emit Revoked(txIndex, msg.sender);
    }

    function getOwners() external view returns (address[] memory) { return owners; }
    function getTransactionCount() external view returns (uint256) { return transactions.length; }
}

/// @title WorkingGroupFactory
/// @notice Factory that deploys `WorkingGroupWallet` instances for each working group.
///         Emits a registry event so off-chain indexers can map group IDs to wallet addresses.
contract WorkingGroupFactory {
    event WalletCreated(bytes32 indexed groupId, address wallet, address[] owners, uint256 threshold);

    /// @dev groupId → deployed wallet address
    mapping(bytes32 => address) public wallets;

    /// @notice Deploy a new multisig wallet for a working group.
    /// @param groupId bytes32-encoded working group UUID
    /// @param owners  Member addresses who will control the wallet
    /// @param threshold  Minimum confirmations required to execute a transaction
    function createGroupWallet(
        bytes32 groupId,
        address[] calldata owners,
        uint256 threshold
    ) external returns (address wallet) {
        require(wallets[groupId] == address(0), "WorkingGroupFactory: already exists");
        WorkingGroupWallet w = new WorkingGroupWallet(owners, threshold);
        wallet = address(w);
        wallets[groupId] = wallet;
        emit WalletCreated(groupId, wallet, owners, threshold);
    }

    /// @notice Resolve a groupId to its wallet address (address(0) if not deployed).
    function getWallet(bytes32 groupId) external view returns (address) {
        return wallets[groupId];
    }
}
