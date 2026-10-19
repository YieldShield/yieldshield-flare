// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {AlpinePool, IAlpineOracle} from "../src/AlpinePool.sol";
import {AlpineDemoDollar, AlpineChainlinkOracle} from "../src/DemoAssets.sol";

interface Vm {
    function deal(address, uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function chainId(uint256) external;
}

contract MutableOracle is IAlpineOracle {
    uint256 public price = 25e6;

    function set(uint256 x) external {
        price = x;
    }
}

contract MockFeed {
    uint8 public decimals = 8;
    int256 public answer = 25e8;
    uint256 public updated;
    uint80 public answered = 2;

    constructor() {
        updated = block.timestamp;
    }

    function set(int256 a, uint256 t, uint80 r) external {
        answer = a;
        updated = t;
        answered = r;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (2, answer, updated, updated, answered);
    }
}

contract AlpinePoolTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    AlpinePool pool;
    AlpineDemoDollar token;
    MutableOracle oracle;
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant CREATOR = address(0xC);
    address constant PROTOCOL = address(0xD);

    function setUp() public {
        vm.chainId(31337);
        vm.warp(10000);
        token = new AlpineDemoDollar();
        oracle = new MutableOracle();
        pool = new AlpinePool(
            address(token),
            address(oracle),
            CREATOR,
            PROTOCOL,
            address(0),
            AlpinePool.Terms(15000, 1000, 100, 7 days, 60, 120)
        );
        vm.deal(ALICE, 100 ether);
        vm.deal(BOB, 100 ether);
        vm.startPrank(BOB);
        token.faucet();
        token.approve(address(pool), type(uint256).max);
        pool.depositJunior(1000e6, 1);
        vm.stopPrank();
    }

    function _open(uint256 amount) private returns (uint256 id) {
        vm.prank(ALICE);
        id = pool.protect{value: amount}(1, block.timestamp);
        vm.warp(block.timestamp + 61);
    }

    function testBackingExitPaysEntryFloorAndSurrendersAllAvax() public {
        uint256 id = _open(1 ether);
        oracle.set(15e6);
        vm.prank(ALICE);
        pool.exitBacking(id);
        require(token.balanceOf(ALICE) == 25e6, "entry floor");
        require(pool.juniorInventory() == 1 ether && pool.totalBacking() == 975e6, "inventory");
        require(pool.reservedBacking() == 0 && pool.protectedBalance() == 0, "release");
        vm.prank(ALICE);
        vm.expectRevert(AlpinePool.NotOwner.selector);
        pool.exitBacking(id);
    }

    function testPositiveGainsFeeDistributionAndNativeSolvency() public {
        uint256 id = _open(1 ether);
        oracle.set(50e6);
        (uint256 out, uint256 fee) = pool.previewExit(id);
        require(out == 0.94 ether && fee == 0.06 ether, "12 percent of positive gain");
        uint256 before = ALICE.balance;
        vm.prank(ALICE);
        pool.exitAvax(id, out);
        require(ALICE.balance - before == out, "recipient");
        require(
            pool.claimableFees(CREATOR) == 0.005 ether && pool.claimableFees(PROTOCOL) == 0.005 ether, "fee recipients"
        );
        require(pool.rewardInventory() == 0.05 ether && address(pool).balance == 0.06 ether, "junior fee");
    }

    function testNoGainNoFee() public {
        uint256 id = _open(1 ether);
        oracle.set(15e6);
        vm.prank(ALICE);
        pool.exitAvax(id, 1 ether);
        require(pool.juniorInventory() == 0 && CREATOR.balance == 0, "no loss fee");
    }

    function testBackingExitDoesNotDependOnOracle() public {
        uint256 id = _open(1 ether);
        oracle.set(0);
        vm.prank(ALICE);
        pool.exitBacking(id);
        require(token.balanceOf(ALICE) == 25e6, "fixed payout");
    }

    function testJuniorCannotWithdrawReservedBacking() public {
        _open(1 ether);
        vm.prank(BOB);
        pool.requestJuniorWithdrawal();
        vm.warp(block.timestamp + 121);
        uint256 amount = pool.shares(BOB);
        vm.prank(BOB);
        vm.expectRevert(AlpinePool.ActiveExposure.selector);
        pool.withdrawJunior(amount, 0, 0);
    }

    function testJuniorWithdrawalPaysAssetBasketAfterClaim() public {
        uint256 id = _open(1 ether);
        vm.prank(ALICE);
        pool.exitBacking(id);
        vm.prank(BOB);
        pool.requestJuniorWithdrawal();
        vm.warp(block.timestamp + 121);
        uint256 amount = pool.shares(BOB);
        uint256 before = BOB.balance;
        vm.prank(BOB);
        pool.withdrawJunior(amount, 975e6, 1 ether);
        require(token.balanceOf(BOB) == 9975e6 && BOB.balance - before == 1 ether, "basket");
        require(pool.totalShares() == 0 && pool.totalBacking() == 0 && pool.juniorInventory() == 0, "empty");
    }

    function testNewJuniorUsesCombinedAssetNAV() public {
        uint256 id = _open(1 ether);
        oracle.set(15e6);
        vm.prank(ALICE);
        pool.exitBacking(id);
        require(pool.juniorValue() == 990e6, "realized decline");
        vm.startPrank(ALICE);
        token.faucet();
        token.approve(address(pool), 990e6);
        pool.depositJunior(990e6, 1000e18);
        vm.stopPrank();
        require(pool.shares(ALICE) == pool.shares(BOB), "equal NAV shares");
    }

    function testDelaysOwnershipAndSlippage() public {
        vm.prank(ALICE);
        uint256 id = pool.protect{value: 1 ether}(25e6, block.timestamp);
        vm.prank(ALICE);
        vm.expectRevert(AlpinePool.NotReady.selector);
        pool.exitBacking(id);
        vm.warp(block.timestamp + 61);
        vm.prank(BOB);
        vm.expectRevert(AlpinePool.NotOwner.selector);
        pool.exitBacking(id);
        vm.prank(ALICE);
        vm.expectRevert(AlpinePool.Slippage.selector);
        pool.exitAvax(id, 2 ether);
        vm.prank(BOB);
        vm.expectRevert(AlpinePool.ActiveExposure.selector);
        pool.withdrawJunior(1e18, 0, 0);
    }

    function testFuzzReserveAndNativeAccounting(uint96 rawAmount, uint32 rawPrice) public {
        uint256 amount = 1e15 + uint256(rawAmount) % (10 ether - 1e15);
        uint256 price = 1e6 + uint256(rawPrice) % 100e6;
        uint256 id = _open(amount);
        oracle.set(price);
        vm.prank(ALICE);
        pool.exitAvax(id, 0);
        require(
            address(pool).balance
                == pool.protectedBalance() + pool.juniorInventory() + pool.rewardInventory() + pool.otherFeeInventory(),
            "native accounting"
        );
        require(token.balanceOf(address(pool)) == pool.totalBacking(), "backing accounting");
        require(pool.totalBacking() >= pool.requiredBacking(pool.reservedBacking()), "reserve ratio");
    }

    function testOracleRejectsStaleFutureNonPositiveAndIncomplete() public {
        MockFeed feed = new MockFeed();
        AlpineChainlinkOracle adapter = new AlpineChainlinkOracle(address(feed), 3600);
        require(adapter.price() == 25e6, "normalizes");
        feed.set(25e8, block.timestamp - 3601, 2);
        vm.expectRevert();
        adapter.price();
        feed.set(25e8, block.timestamp + 1, 2);
        vm.expectRevert();
        adapter.price();
        feed.set(0, block.timestamp, 2);
        vm.expectRevert();
        adapter.price();
        feed.set(-1, block.timestamp, 2);
        vm.expectRevert();
        adapter.price();
        feed.set(25e8, block.timestamp, 1);
        vm.expectRevert();
        adapter.price();
    }

    function testJuniorFairnessCannotEscapeUnrealizedShortfall() public {
        _open(10 ether);
        oracle.set(15e6);
        vm.startPrank(BOB);
        pool.requestJuniorWithdrawal();
        vm.warp(block.timestamp + 121);
        vm.expectRevert(AlpinePool.ActiveExposure.selector);
        pool.withdrawJunior(500e18, 0, 0);
        vm.expectRevert(AlpinePool.ActiveExposure.selector);
        pool.depositJunior(100e6, 1);
        vm.stopPrank();
    }

    function testExpiryUnblocksJuniorWithoutOwnerAndKeepsClaimSolvent() public {
        uint256 id = _open(10 ether);
        oracle.set(0);
        vm.warp(pool.maturity());
        vm.prank(BOB);
        pool.settleExpired(id);
        require(pool.reservedBacking() == 0 && pool.totalBacking() == 750e6, "settled");
        require(pool.claimableBacking(ALICE) == 250e6 && pool.totalClaimableBacking() == 250e6, "owed");
        vm.prank(BOB);
        pool.requestJuniorWithdrawal();
        vm.warp(block.timestamp + 121);
        uint256 amount = pool.shares(BOB);
        vm.prank(BOB);
        pool.withdrawJunior(amount, 750e6, 10 ether);
        require(token.balanceOf(address(pool)) == 250e6, "owner credit remains");
        vm.prank(ALICE);
        pool.claimBacking();
        require(token.balanceOf(ALICE) == 250e6, "claim");
        require(pool.totalClaimableBacking() == 0, "claim liability released");
        vm.prank(ALICE);
        vm.expectRevert(AlpinePool.InvalidAmount.selector);
        pool.claimBacking();
    }

    function testEpochAdmissionCutoffAndUpsideForfeiture() public {
        uint256 id = _open(1 ether);
        vm.warp(pool.maturity() - 60);
        vm.prank(ALICE);
        vm.expectRevert(AlpinePool.EpochClosed.selector);
        pool.protect{value: 1 ether}(1, block.timestamp);
        vm.warp(pool.maturity());
        oracle.set(50e6);
        vm.prank(ALICE);
        vm.expectRevert(AlpinePool.EpochClosed.selector);
        pool.exitAvax(id, 0);
        pool.settleExpired(id);
        require(pool.claimableBacking(ALICE) == 25e6, "expiry floor only");
    }

    function testMainnetDeploymentRejected() public {
        vm.chainId(43114);
        vm.expectRevert();
        new AlpinePool(
            address(token),
            address(oracle),
            CREATOR,
            PROTOCOL,
            address(0),
            AlpinePool.Terms(15000, 1000, 100, 7 days, 60, 120)
        );
    }
}
