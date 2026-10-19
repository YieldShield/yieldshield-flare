// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Valueless Coston2-only demo backing. NOT USDT0, not Flare's testUSDT0 and not dollar redeemable.
contract ShieldDemoDollar is ERC20 {
    mapping(address => uint256) public nextClaim;

    constructor() ERC20("Shield Demo Dollar - not USDT0, no value", "sDEMO") {
        require(block.chainid == 114 || block.chainid == 31337, "TESTNET_ONLY");
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

/// @notice Public, deterministic synthetic scenario: never a real market price. Scaled to FLR's
/// price level: 0.0060 -> 0.0084 -> 0.0036 sDEMO per C2FLR, rotating every 120 seconds.
contract ShieldScenarioOracle {
    uint256 public immutable start = block.timestamp;

    function price() external view returns (uint256) {
        uint256 step = ((block.timestamp - start) / 120) % 3;
        return step == 0 ? 6000 : step == 1 ? 8400 : 3600;
    }
}
