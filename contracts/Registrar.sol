//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

contract Registrar {
    uint256 public constant DURATION = 365 days;
    uint256 public constant LOCK_AMOUNT = 1 ether;
    uint256 public constant MIN_COMMITMENT_DELAY = 5 minutes;

    uint256[] public feeTiers = [0.3 ether, 0.2 ether];
    address payable public feeRecipient = payable(msg.sender);

    struct Registry {
        address owner;
        uint256 registeredAt;
    }

    mapping(bytes32 => Registry) public registry;
    mapping(bytes32 => uint256) public commitments;

    error AlreadyCommitted(bytes32 commitment);
    error InvalidCommitment(bytes32 commitment);
    error NotDelayedCommitment(bytes32 commitment);
    error CommitmentMismatch(bytes32 commitment, bytes32 computedCommitment);
    error AlreadyRegistered(string name);
    error InsufficientAmount();
    error CallerIsNotOwner(address caller, address owner);
    error RegistrationNotExpired();

    function commit(bytes32 commitment) external {
        if (commitments[commitment] != 0) revert AlreadyCommitted(commitment);
        commitments[commitment] = block.timestamp;
    }

    function registerPostCommit(
        bytes32 commitment,
        string memory name,
        address owner,
        bytes32 secret
    ) external payable {
        if (commitments[commitment] == 0) revert InvalidCommitment(commitment);
        if (commitments[commitment] + MIN_COMMITMENT_DELAY > block.timestamp)
            revert NotDelayedCommitment(commitment);
        if (ownerOf(name) != address(0)) revert AlreadyRegistered(name);

        bytes32 label = keccak256(bytes(name));
        bytes32 computedCommitment = keccak256(
            abi.encodePacked(label, owner, secret)
        );

        if (commitment != computedCommitment)
            revert CommitmentMismatch(commitment, computedCommitment);

        uint256 fee = _calcFee(name);
        if (msg.value < LOCK_AMOUNT + fee) revert InsufficientAmount();

        delete commitments[commitment];
        registry[label] = Registry({
            owner: owner,
            registeredAt: block.timestamp
        });
        feeRecipient.transfer(fee);
    }

    function extendRegistration(string memory name) external payable {
        bytes32 label = keccak256(bytes(name));
        Registry memory registryDetails = registry[label];
        if (msg.sender != registryDetails.owner)
            revert CallerIsNotOwner(msg.sender, registryDetails.owner);

        uint256 fee = _calcFee(name);
        if (msg.value < fee) revert InsufficientAmount();

        registryDetails.registeredAt = block.timestamp;
        registry[label] = registryDetails;
        feeRecipient.transfer(fee);
    }

    function deregister(string memory name) external {
        bytes32 label = keccak256(bytes(name));
        Registry memory registryDetails = registry[label];

        if (block.timestamp <= registryDetails.registeredAt + DURATION)
            revert RegistrationNotExpired();

        delete registry[label];
        payable(registryDetails.owner).transfer(LOCK_AMOUNT);
    }

    function _calcFee(string memory name) internal view returns (uint256 fee) {
        uint256 length = strlen(name);
        if (length <= 3) {
            fee = feeTiers[0];
        } else {
            fee = feeTiers[1];
        }
    }

    function ownerOf(string memory name) public view returns (address owner) {
        return registry[keccak256(bytes(name))].owner;
    }

    function calcFee(string memory name) external view returns (uint256 fee) {
        fee = _calcFee(name);
    }

    /**
     * @dev Returns the length of a given string
     * @param s The string to measure the length of
     * @return The length of the input string
     */
    function strlen(string memory s) internal pure returns (uint256) {
        uint256 len;
        uint256 i = 0;
        uint256 bytelength = bytes(s).length;
        for (len = 0; i < bytelength; len++) {
            bytes1 b = bytes(s)[i];
            if (b < 0x80) {
                i += 1;
            } else if (b < 0xE0) {
                i += 2;
            } else if (b < 0xF0) {
                i += 3;
            } else if (b < 0xF8) {
                i += 4;
            } else if (b < 0xFC) {
                i += 5;
            } else {
                i += 6;
            }
        }
        return len;
    }
}
