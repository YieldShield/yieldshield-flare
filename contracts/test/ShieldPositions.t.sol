// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ShieldPool} from "../src/ShieldPool.sol";
import {ShieldDemoDollar} from "../src/DemoAssets.sol";
import {Vm, MutableOracle} from "./ShieldPool.t.sol";

/// @notice Position-slot regressions: slots bound open exposure, not lifetime activity.
contract ShieldPositionsTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ShieldPool pool;
    ShieldDemoDollar token;
    MutableOracle oracle;
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant MALLORY = address(0xBAD);

    function setUp() public {
        vm.chainId(31337);
        vm.warp(10000);
        token = new ShieldDemoDollar();
        oracle = new MutableOracle();
        pool = new ShieldPool(
            address(token), address(oracle), address(0xC), address(0xD), address(0),
            ShieldPool.Terms(15000, 1000, 100, 7 days, 60, 120)
        );
        vm.deal(ALICE, 100 ether);
        vm.deal(MALLORY, 100 ether);
        vm.startPrank(BOB);
        token.faucet();
        token.approve(address(pool), type(uint256).max);
        pool.depositJunior(1000e6, 1);
        vm.stopPrank();
    }

    function _open(address who, uint256 amount) private returns (uint256 id) {
        vm.prank(who);
        id = pool.protect{value: amount}(1, block.timestamp);
    }

    function testDustBelowMinimumFloorIsRejected() public {
        // 4e10 wei at 25 sDEMO per native unit is a 1-micro-unit floor.
        vm.prank(MALLORY);
        vm.expectRevert(ShieldPool.InvalidAmount.selector);
        pool.protect{value: 4e10}(1, block.timestamp);
        // 0.001 native units at this test price (a 0.025 sDEMO floor) remain allowed.
        _open(ALICE, 1e15);
    }

    function testOpenThenCloseCyclesDoNotExhaustSlots() public {
        for (uint256 i; i < 120; i++) {
            uint256 id = _open(MALLORY, 1e15);
            vm.warp(block.timestamp + 61);
            vm.prank(MALLORY);
            pool.exitBacking(id);
        }
        require(pool.nextPositionId() == 121, "lifetime ids keep counting");
        require(pool.openPositionIds().length == 0, "nothing open");
        _open(ALICE, 1 ether);
    }

    function testOpenSlotCapAndRelease() public {
        uint256 first = _open(MALLORY, 1e15);
        for (uint256 i = 1; i < 100; i++) _open(MALLORY, 1e15);
        vm.prank(ALICE);
        vm.expectRevert(ShieldPool.PositionLimit.selector);
        pool.protect{value: 1 ether}(1, block.timestamp);
        vm.warp(block.timestamp + 61);
        vm.prank(MALLORY);
        pool.exitBacking(first);
        _open(ALICE, 1 ether);
    }

    function testOpenIdsTrackPartialAndFullExits() public {
        uint256 a = _open(ALICE, 1 ether);
        uint256 b = _open(ALICE, 1 ether);
        vm.warp(block.timestamp + 61);
        vm.startPrank(ALICE);
        pool.partialExitBacking(a, 0.5 ether, 0, block.timestamp);
        uint256[] memory ids = pool.openPositionIds();
        require(ids.length == 2, "partial exit keeps slot");
        pool.exitBacking(b);
        vm.stopPrank();
        ids = pool.openPositionIds();
        require(ids.length == 1 && ids[0] == a, "full exit frees slot");
        vm.warp(pool.maturity());
        pool.settleExpired(a);
        require(pool.openPositionIds().length == 0, "settlement frees slot");
    }
}
