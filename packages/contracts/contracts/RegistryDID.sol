// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RegistryDID
/// @notice Maps AgentColony agent IDs to their DID document hashes on Base L2.
///         Enables cryptographically verifiable, immutable agent identity anchoring.
contract RegistryDID {
    /// @dev agentId (bytes32-encoded UUID) → SHA-256 hash of the DID document
    mapping(bytes32 => bytes32) private _registry;

    /// @dev agentId → original registrar address (for ownership queries)
    mapping(bytes32 => address) private _registrar;

    event DIDRegistered(bytes32 indexed agentId, bytes32 documentHash, address registrar);
    event DIDUpdated(bytes32 indexed agentId, bytes32 oldHash, bytes32 newHash);

    error NotRegistrar(bytes32 agentId);
    error AlreadyRegistered(bytes32 agentId);

    /// @notice Register a new agent DID. Each agentId can only be registered once.
    /// @param agentId  bytes32-encoded UUID of the agent
    /// @param documentHash  SHA-256 hash of the DID document JSON
    function register(bytes32 agentId, bytes32 documentHash) external {
        if (_registrar[agentId] != address(0)) revert AlreadyRegistered(agentId);
        _registry[agentId] = documentHash;
        _registrar[agentId] = msg.sender;
        emit DIDRegistered(agentId, documentHash, msg.sender);
    }

    /// @notice Update the DID document hash. Only the original registrar may update.
    /// @param agentId  bytes32-encoded UUID of the agent
    /// @param newDocumentHash  SHA-256 hash of the updated DID document JSON
    function update(bytes32 agentId, bytes32 newDocumentHash) external {
        if (_registrar[agentId] != msg.sender) revert NotRegistrar(agentId);
        bytes32 old = _registry[agentId];
        _registry[agentId] = newDocumentHash;
        emit DIDUpdated(agentId, old, newDocumentHash);
    }

    /// @notice Resolve an agent ID to its DID document hash.
    /// @param agentId  bytes32-encoded UUID of the agent
    /// @return documentHash  SHA-256 hash, or bytes32(0) if not registered
    function resolve(bytes32 agentId) external view returns (bytes32 documentHash) {
        return _registry[agentId];
    }

    /// @notice Check who registered an agent DID.
    /// @param agentId  bytes32-encoded UUID of the agent
    /// @return registrar  Address that performed the registration, or address(0) if unregistered
    function registrarOf(bytes32 agentId) external view returns (address registrar) {
        return _registrar[agentId];
    }
}
