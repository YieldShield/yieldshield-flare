// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Valueless Fuji-only demo backing. NOT Circle USDC or dollar redeemable.
contract AlpineDemoDollar is ERC20 {
    mapping(address => uint256) public nextClaim;

    constructor() ERC20("Alpine Demo Dollar", "aDEMO") {
        require(block.chainid == 43113 || block.chainid == 31337, "TESTNET_ONLY");
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        require(block.timestamp >= nextClaim[msg.sender], "COOLDOWN");
        nextClaim[msg.sender] = block.timestamp + 1 hours;
        _mint(msg.sender, 10000e6);
    }
}

/// @notice Public, deterministic synthetic scenario: never a real market price.
contract AlpineScenarioOracle {
    uint256 public immutable start = block.timestamp;

    function price() external view returns (uint256) {
        uint256 step = ((block.timestamp - start) / 120) % 3;
        return step == 0 ? 25e6 : step == 1 ? 35e6 : 15e6;
    }
}

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Read-only adapter; no implicit fallback from a stale real feed to a demo price.
contract AlpineChainlinkOracle {
    IAggregatorV3 public immutable feed;
    uint256 public immutable maxAge;
    uint8 public immutable feedDecimals;

    constructor(address feed_, uint256 maxAge_) {
        require(maxAge_ > 0 && maxAge_ <= 1 days, "MAX_AGE");
        feed = IAggregatorV3(feed_);
        maxAge = maxAge_;
        feedDecimals = IAggregatorV3(feed_).decimals();
        require(feedDecimals <= 18, "DECIMALS");
    }

    function price() external view returns (uint256) {
        (uint80 round, int256 answer,, uint256 updated, uint80 answered) = feed.latestRoundData();
        require(
            answer > 0 && answered >= round && updated > 0 && updated <= block.timestamp
                && block.timestamp - updated <= maxAge,
            "INVALID_OR_STALE_PRICE"
        );
        uint256 result =
            feedDecimals >= 6 ? uint256(answer) / 10 ** (feedDecimals - 6) : uint256(answer) * 10 ** (6 - feedDecimals);
        require(result > 0, "ZERO_PRICE");
        return result;
    }
}
