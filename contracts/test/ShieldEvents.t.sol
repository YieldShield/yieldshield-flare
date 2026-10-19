// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ShieldPool} from "../src/ShieldPool.sol";
import {ShieldDemoDollar} from "../src/DemoAssets.sol";
import {MutableOracle} from "./ShieldPool.t.sol";

interface VmEvents {
    function deal(address, uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function chainId(uint256) external;
    function expectEmit(bool, bool, bool, bool) external;
}

contract ShieldEventsTest {
    VmEvents constant vm = VmEvents(address(uint160(uint256(keccak256("hevm cheat code")))));
    event GainFeesCharged(uint256 indexed id, uint256 providerReward, uint256 creatorFee, uint256 protocolFee);
    ShieldPool pool;
    MutableOracle oracle;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(10000);
        ShieldDemoDollar token = new ShieldDemoDollar();
        oracle = new MutableOracle();
        pool = new ShieldPool(
            address(token), address(oracle), address(0xC), address(0xD), address(0),
            ShieldPool.Terms(15000, 1000, 100, 7 days, 60, 120)
        );
        vm.deal(address(0xA11CE), 10 ether);
        vm.startPrank(address(0xB0B));
        token.faucet();
        token.approve(address(pool), type(uint256).max);
        pool.depositJunior(1000e6, 1);
        vm.stopPrank();
    }

    function testGainExitReportsFeeSplit() public {
        vm.prank(address(0xA11CE));
        uint256 id = pool.protect{value: 1 ether}(1, block.timestamp);
        vm.warp(block.timestamp + 61);
        oracle.set(50e6); // value doubles: gain is half the protected C2FLR
        vm.expectEmit(true, false, false, true);
        emit GainFeesCharged(id, 0.05 ether, 0.005 ether, 0.005 ether);
        vm.prank(address(0xA11CE));
        pool.exitAsset(id, 0);
    }
}
