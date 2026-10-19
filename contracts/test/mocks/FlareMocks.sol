// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Local-only stand-ins for Flare system contracts. They are used by Foundry tests, the local
// journey and the chain-114 rehearsal, and are never deployed to Coston2. None of them has a
// constructor-dependent state, so the rehearsal can install their runtime code at the canonical
// Coston2 addresses with anvil_setCode.

/// @notice Stand-in for the FlareContractRegistry: name lookups for registered contracts.
contract MockFlareContractRegistry {
    mapping(bytes32 => address) private entries;

    function setContractAddress(string calldata name, address target) external {
        entries[keccak256(abi.encode(name))] = target;
    }

    function getContractAddressByName(string calldata name) external view returns (address) {
        return entries[keccak256(abi.encode(name))];
    }

    function getContractAddressByHash(bytes32 nameHash) external view returns (address) {
        return entries[nameHash];
    }
}

/// @notice Stand-in for FtsoV2 with the production `payable` read signatures and an optional fee.
contract MockFtsoV2 {
    struct Feed {
        bool exists;
        bool live;
        uint256 value;
        int8 decimals;
        uint64 timestamp;
    }

    mapping(bytes21 => Feed) public feeds;
    uint256 public fee;

    /// @notice Sets a feed whose timestamp follows the current block, like a block-latency feed.
    function setFeed(bytes21 id, uint256 value, int8 decimals) external {
        feeds[id] = Feed(true, true, value, decimals, 0);
    }

    /// @notice Pins a feed's timestamp, for stale, zero or future timestamp cases.
    function setFeedTimestamp(bytes21 id, uint64 timestamp) external {
        require(feeds[id].exists, "feed not supported");
        feeds[id].live = false;
        feeds[id].timestamp = timestamp;
    }

    function setFee(uint256 fee_) external {
        fee = fee_;
    }

    function getFeedById(bytes21 id) external payable returns (uint256, int8, uint64) {
        require(msg.value >= fee, "fee too low");
        Feed memory f = feeds[id];
        require(f.exists, "feed not supported");
        return (f.value, f.decimals, f.live ? uint64(block.timestamp) : f.timestamp);
    }

    function calculateFeeById(bytes21) external view returns (uint256) {
        return fee;
    }
}

/// @notice A non-compliant FtsoV2 whose read writes state. The adapter's STATICCALL must revert.
contract MutatingFtsoV2 {
    uint256 public reads;

    function getFeedById(bytes21) external payable returns (uint256, int8, uint64) {
        reads++;
        return (639928, 8, uint64(block.timestamp));
    }

    function calculateFeeById(bytes21) external pure returns (uint256) {
        return 0;
    }
}

/// @notice WETH9-style stand-in for Coston2's WC2FLR (WNat): same deposit/withdraw/ERC-20 surface.
contract MockWNat is ERC20 {
    event Deposit(address indexed dst, uint256 amount);
    event Withdrawal(address indexed src, uint256 amount);

    constructor() ERC20("", "") {}

    function name() public pure override returns (string memory) {
        return "Wrapped Coston2Flare (local mock)";
    }

    function symbol() public pure override returns (string memory) {
        return "WC2FLR";
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");
    }
}
