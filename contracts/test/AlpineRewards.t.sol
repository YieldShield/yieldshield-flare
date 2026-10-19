// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {AlpinePool} from "../src/AlpinePool.sol";
import {AlpineDemoDollar} from "../src/DemoAssets.sol";
import {Vm, MutableOracle} from "./AlpinePool.t.sol";

/// @notice Reward-index solvency regressions: total earnings must never exceed the reward inventory.
contract AlpineRewardsTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    AlpinePool pool;
    AlpineDemoDollar token;
    MutableOracle oracle;
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant CAROL = address(0xCA201);
    address constant ERIN = address(0xE21);

    function setUp() public {
        vm.chainId(31337);
        vm.warp(10000);
        token = new AlpineDemoDollar();
        oracle = new MutableOracle();
        pool = new AlpinePool(
            address(token), address(oracle), address(0xC), address(0xD), address(0),
            AlpinePool.Terms(15000, 1000, 100, 7 days, 60, 120)
        );
        vm.deal(ALICE, 1000 ether);
        _fund(BOB);
        _fund(CAROL);
        _fund(ERIN);
        vm.prank(BOB);
        pool.depositJunior(1000e6, 1);
    }

    function _fund(address who) private {
        vm.startPrank(who);
        token.faucet();
        token.approve(address(pool), type(uint256).max);
        vm.stopPrank();
    }

    function _gainExit(uint256 amount) private {
        vm.prank(ALICE);
        uint256 id = pool.protect{value: amount}(1, block.timestamp);
        vm.warp(block.timestamp + 61);
        uint256 p0 = oracle.price();
        oracle.set(p0 * 2);
        vm.prank(ALICE);
        pool.exitAvax(id, 0);
        oracle.set(p0);
    }

    /// Leaves AVAX inventory so later deposits mint shares at a non-round NAV.
    function _unevenNav() private {
        vm.prank(ALICE);
        uint256 id = pool.protect{value: 1 ether}(1, block.timestamp);
        vm.warp(block.timestamp + 61);
        vm.prank(ALICE);
        pool.exitBacking(id);
        oracle.set(23_456_789);
    }

    function testEveryProviderCanClaimAfterUnevenShareChanges() public {
        _unevenNav();
        _gainExit(0.1 ether + 2);
        vm.prank(CAROL);
        pool.depositJunior(10_012_762, 1);
        vm.prank(ERIN);
        pool.depositJunior(13_691_282, 1);
        _gainExit(0.1 ether + 4538145148986);
        require(pool.earned(BOB) + pool.earned(CAROL) + pool.earned(ERIN) <= pool.rewardInventory(), "over-credited");
        vm.prank(BOB);
        pool.claimRewards(BOB);
        vm.prank(CAROL);
        pool.claimRewards(CAROL);
        uint256 last = pool.earned(ERIN);
        require(last > 1e12, "meaningful reward");
        vm.prank(ERIN);
        pool.claimRewards(ERIN);
        require(ERIN.balance == last, "last claimer paid");
    }

    function testFuzzRewardsNeverExceedInventory(uint32 rawD, uint32 rawE, uint64 rawA, uint64 rawB) public {
        _unevenNav();
        _gainExit(0.1 ether + uint256(rawA) % 1 ether);
        vm.prank(CAROL);
        pool.depositJunior(10e6 + uint256(rawD) % 990e6, 1);
        vm.prank(ERIN);
        pool.depositJunior(10e6 + uint256(rawE) % 990e6, 1);
        _gainExit(0.1 ether + uint256(rawB) % 1 ether);
        require(pool.earned(BOB) + pool.earned(CAROL) + pool.earned(ERIN) <= pool.rewardInventory(), "over-credited");
    }
}
