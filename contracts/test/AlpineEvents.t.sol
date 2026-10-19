// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {AlpinePool} from "../src/AlpinePool.sol";
import {AlpineDemoDollar} from "../src/DemoAssets.sol";
import {MutableOracle} from "./AlpinePool.t.sol";

interface VmEvents {
    function deal(address, uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function chainId(uint256) external;
    function expectEmit(bool, bool, bool, bool) external;
}

contract AlpineEventsTest {
    VmEvents constant vm = VmEvents(address(uint160(uint256(keccak256("hevm cheat code")))));
    event GainFeesCharged(uint256 indexed id, uint256 providerReward, uint256 creatorFee, uint256 protocolFee);
    AlpinePool pool;
    MutableOracle oracle;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(10000);
        AlpineDemoDollar token = new AlpineDemoDollar();
        oracle = new MutableOracle();
        pool = new AlpinePool(
            address(token), address(oracle), address(0xC), address(0xD), address(0),
            AlpinePool.Terms(15000, 1000, 100, 7 days, 60, 120)
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
        oracle.set(50e6); // value doubles: gain is half the AVAX
        vm.expectEmit(true, false, false, true);
        emit GainFeesCharged(id, 0.05 ether, 0.005 ether, 0.005 ether);
        vm.prank(address(0xA11CE));
        pool.exitAvax(id, 0);
    }
}
