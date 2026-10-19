// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {AlpinePool, IAlpineOracle} from "../src/AlpinePool.sol";
import {AlpineDemoDollar} from "../src/DemoAssets.sol";
import {
    AlpineBackingVault,
    AlpineWrappedAVAX,
    AlpineDemoVault,
    AlpineVaultOracle,
    AlpineFactory,
    AlpineExchange
} from "../src/AlpineMarket.sol";
import {Vm, MutableOracle} from "./AlpinePool.t.sol";

contract AlpineParityTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant HOLDER = address(0xA11CE);
    address constant PROVIDER = address(0xB0B);
    address constant CREATOR = address(0xC);
    address constant PROTOCOL = address(0xD);
    AlpineDemoDollar backing;
    MutableOracle oracle;
    AlpinePool pool;
    AlpineWrappedAVAX wrapper;
    AlpineDemoVault vault;
    AlpineVaultOracle vaultOracle;
    AlpineFactory factory;
    AlpineExchange exchange;
    AlpineBackingVault backingVault;

    function terms() private pure returns (AlpinePool.Terms memory) {
        return AlpinePool.Terms(15000, 1000, 100, 7 days, 60, 120);
    }

    function setUp() public {
        vm.chainId(31337);
        vm.warp(10000);
        vm.deal(HOLDER, 100 ether);
        vm.deal(PROVIDER, 100 ether);
        vm.deal(address(this), 100 ether);
        backing = new AlpineDemoDollar();
        oracle = new MutableOracle();
        wrapper = new AlpineWrappedAVAX();
        vault = new AlpineDemoVault(backing);
        vaultOracle = new AlpineVaultOracle(vault);
        backingVault = new AlpineBackingVault(backing);
        factory = new AlpineFactory(
            backing,
            PROTOCOL,
            address(wrapper),
            address(vault),
            address(oracle),
            address(oracle),
            address(vaultOracle),
            backingVault
        );
        exchange = new AlpineExchange(backing, factory);
        pool = new AlpinePool(address(backing), address(oracle), CREATOR, PROTOCOL, address(0), terms());
        vm.startPrank(PROVIDER);
        backing.faucet();
        backing.approve(address(pool), type(uint256).max);
        pool.depositJunior(1000e6, 1);
        vm.stopPrank();
        vm.startPrank(HOLDER);
        backing.faucet();
        backing.approve(address(factory), type(uint256).max);
        backing.approve(address(exchange), type(uint256).max);
        backing.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }
    receive() external payable {}

    function open() private returns (uint256 id) {
        vm.prank(HOLDER);
        id = pool.protect{value: 1 ether}(25e6, block.timestamp);
        vm.warp(block.timestamp + 61);
    }

    function testPartialBackingThenAssetExitPreservesRemainingClaim() public {
        uint256 id = open();
        vm.prank(HOLDER);
        pool.partialExitBacking(id, 0.333333333333333333 ether, 8e6, block.timestamp);
        (, uint256 amount, uint256 floor,) = pool.positions(id);
        require(amount == 0.666666666666666667 ether && floor == 16666667, "conservative remaining claim");
        require(pool.reservedBacking() == floor, "remaining reserve");
        vm.prank(HOLDER);
        pool.partialExitAsset(id, amount, amount, block.timestamp);
        require(pool.reservedBacking() == 0 && pool.protectedBalance() == 0, "fully closed");
        vm.prank(HOLDER);
        vm.expectRevert();
        pool.exitBacking(id);
    }

    function testPartialPositiveGainPaysIndependentRewardsWithoutPrincipalLoss() public {
        uint256 id = open();
        oracle.set(50e6);
        vm.prank(HOLDER);
        pool.partialExitAsset(id, 0.5 ether, 0.47 ether, block.timestamp);
        require(pool.earned(PROVIDER) == 0.025 ether, "half gain fee");
        require(pool.protectedBalance() == 0.5 ether && pool.juniorInventory() == 0, "principal segregated");
        uint256 before = PROVIDER.balance;
        vm.prank(PROVIDER);
        pool.claimRewards(PROVIDER);
        require(PROVIDER.balance - before == 0.025 ether, "claim received");
        require(
            pool.protectedBalance() == 0.5 ether && pool.totalBacking() == 1000e6 && pool.rewardInventory() == 0,
            "reward cannot consume principal"
        );
    }

    function testRewardsCannotBeClaimedTwiceOrInheritedByNewDepositor() public {
        uint256 id = open();
        oracle.set(50e6);
        vm.prank(HOLDER);
        pool.exitAvax(id, 0);
        vm.startPrank(HOLDER);
        backing.approve(address(pool), 1000e6);
        pool.depositJunior(1000e6, 1);
        vm.stopPrank();
        require(pool.earned(HOLDER) == 0 && pool.earned(PROVIDER) == 0.05 ether, "new shares have no past reward");
        vm.prank(PROVIDER);
        pool.claimRewards(PROVIDER);
        vm.prank(PROVIDER);
        vm.expectRevert(AlpinePool.InvalidAmount.selector);
        pool.claimRewards(PROVIDER);
    }

    function testPartialJuniorRedemptionKeepsPriorRewardsClaimable() public {
        uint256 id = open();
        oracle.set(50e6);
        vm.prank(HOLDER);
        pool.exitAvax(id, 0);
        vm.prank(PROVIDER);
        pool.requestJuniorWithdrawal();
        vm.warp(block.timestamp + 121);
        vm.prank(PROVIDER);
        pool.withdrawJunior(500e18, 500e6, 0);
        require(
            pool.shares(PROVIDER) == 500e18 && pool.earned(PROVIDER) == 0.05 ether,
            "partial withdrawal preserves rewards"
        );
        vm.prank(PROVIDER);
        pool.claimRewards(PROVIDER);
        require(pool.totalBacking() == 500e6, "principal intact");
    }

    function testCancelNoticeResetsOnlyCaller() public {
        vm.prank(PROVIDER);
        pool.requestJuniorWithdrawal();
        vm.prank(PROVIDER);
        pool.cancelJuniorWithdrawal();
        require(pool.withdrawalReadyAt(PROVIDER) == 0, "cancelled");
        vm.warp(block.timestamp + 121);
        vm.prank(PROVIDER);
        vm.expectRevert(AlpinePool.NotReady.selector);
        pool.withdrawJunior(1e18, 0, 0);
    }

    function testPartialBoundAndDeadlineCannotBeBypassed() public {
        uint256 id = open();
        vm.prank(HOLDER);
        vm.expectRevert(AlpinePool.Slippage.selector);
        pool.partialExitAsset(id, 0.5 ether, 0.51 ether, block.timestamp);
        vm.prank(HOLDER);
        vm.expectRevert();
        pool.partialExitBacking(id, 0.5 ether, 1, block.timestamp - 1);
        require(pool.protectedBalance() == 1 ether, "failed exits unchanged");
    }

    function testFactoryCreatesAndSeedsAtomically() public {
        vm.prank(HOLDER);
        address created = factory.createPool(address(wrapper), address(oracle), terms(), block.timestamp);
        AlpinePool market = AlpinePool(created);
        require(factory.isPool(created) && factory.allPools().length == 1, "registered");
        require(market.creator() == HOLDER && market.protectedToken() == address(wrapper), "identities");
        require(market.shares(HOLDER) == 500e18 && market.totalBacking() == 500e6, "creation seed belongs to creator");
        require(backing.balanceOf(address(factory)) == 0, "no unaccounted bond");
    }

    function testFactoryRejectsUnsupportedPairAndBadTermsWithoutRegistration() public {
        vm.prank(HOLDER);
        vm.expectRevert();
        factory.createPool(address(vault), address(oracle), terms(), block.timestamp);
        AlpinePool.Terms memory t = terms();
        t.collateralBps = 10000;
        vm.prank(HOLDER);
        vm.expectRevert();
        factory.createPool(address(wrapper), address(oracle), t, block.timestamp);
        require(factory.allPools().length == 0, "atomic rejection");
    }

    function testERC20ProtectionAndPartialExitAreRealTokenTransfers() public {
        vm.prank(HOLDER);
        AlpinePool market = AlpinePool(factory.createPool(address(wrapper), address(oracle), terms(), block.timestamp));
        vm.startPrank(HOLDER);
        wrapper.deposit{value: 1 ether}();
        wrapper.approve(address(market), 1 ether);
        uint256 id = market.protectToken(1 ether, 25e6, block.timestamp);
        vm.warp(block.timestamp + 61);
        market.partialExitAsset(id, 0.5 ether, 0.5 ether, block.timestamp);
        require(
            wrapper.balanceOf(HOLDER) == 0.5 ether && wrapper.balanceOf(address(market)) == 0.5 ether, "ERC20 custody"
        );
        market.exitBacking(id);
        require(market.juniorInventory() == 0.5 ether, "surrendered inventory");
        vm.stopPrank();
    }

    function testFundedVaultDepositDonationAndRedemption() public {
        vm.startPrank(HOLDER);
        uint256 issued = vault.deposit(100e6, HOLDER);
        require(issued == 100e18 && vault.decimals() == 18, "scaled funded receipts");
        vault.donate(10e6);
        require(vaultOracle.price() > 1e6, "funded gain");
        uint256 output = vault.redeem(issued, HOLDER, HOLDER);
        require(output > 109999990 && output <= 110e6, "funded redeem");
        vm.stopPrank();
    }

    function testFundedNativeBuySellAndPriceLimits() public {
        (bool ok,) = address(exchange).call{value: 2 ether}("");
        require(ok);
        vm.startPrank(PROVIDER);
        backing.approve(address(exchange), 1000e6);
        exchange.fundToken(address(backing), 1000e6);
        vm.stopPrank();
        (uint256 cost,) = exchange.quote(address(0), 1 ether, true);
        uint256 before = HOLDER.balance;
        vm.prank(HOLDER);
        exchange.buy(address(0), 1 ether, cost, block.timestamp);
        require(HOLDER.balance - before == 1 ether, "actual bought native");
        (uint256 proceeds,) = exchange.quote(address(0), 1 ether, false);
        uint256 balance = backing.balanceOf(HOLDER);
        vm.prank(HOLDER);
        exchange.sellNative{value: 1 ether}(proceeds, block.timestamp);
        require(backing.balanceOf(HOLDER) - balance == proceeds, "actual sell proceeds");
        vm.prank(HOLDER);
        vm.expectRevert();
        exchange.buy(address(0), 1 ether, cost - 1, block.timestamp);
    }

    function testTokenBuyThenProtectContinuity() public {
        wrapper.deposit{value: 2 ether}();
        wrapper.approve(address(exchange), 2 ether);
        exchange.fundToken(address(wrapper), 2 ether);
        vm.prank(HOLDER);
        AlpinePool market = AlpinePool(factory.createPool(address(wrapper), address(oracle), terms(), block.timestamp));
        (uint256 cost,) = exchange.quote(address(wrapper), 1 ether, true);
        vm.startPrank(HOLDER);
        exchange.buy(address(wrapper), 1 ether, cost, block.timestamp);
        wrapper.approve(address(market), 1 ether);
        market.protectToken(1 ether, 25e6, block.timestamp);
        vm.stopPrank();
        require(market.protectedBalance() == 1 ether && wrapper.balanceOf(HOLDER) == 0, "confirmed output protects");
    }

    function testFuzzPartialBackingNeverOverpaysEntry(uint64 raw) public {
        uint256 id = open();
        uint256 part = 1e14 + uint256(raw) % (1 ether - 1e14);
        vm.prank(HOLDER);
        pool.partialExitBacking(id, part, 1, block.timestamp);
        (, uint256 remaining, uint256 floor,) = pool.positions(id);
        require(remaining + part == 1 ether, "asset conservation");
        uint256 paid = backing.balanceOf(HOLDER) - 10000e6;
        require(paid + floor == 25e6 && pool.reservedBacking() == floor, "floor conservation");
    }

    function testBoundedVaultConversionAndSixDecimalBacking() public {
        vm.startPrank(HOLDER);
        backing.approve(address(backingVault), 1000e6);
        vm.expectRevert();
        backingVault.depositBounded(100e6, HOLDER, 101e6, block.timestamp);
        require(backingVault.balanceOf(HOLDER) == 0, "failed bound atomic");
        backingVault.depositBounded(1000e6, HOLDER, 1000e6, block.timestamp);
        backingVault.approve(address(factory), 500e6);
        address market =
            factory.createPoolWithBacking(address(0), address(oracle), address(backingVault), terms(), block.timestamp);
        AlpinePool p = AlpinePool(market);
        require(address(p.backing()) == address(backingVault) && p.totalBacking() == 500e6, "vault collateral units");
        uint256 id = p.protect{value: 1 ether}(25e6, block.timestamp);
        vm.warp(block.timestamp + 61);
        p.exitBacking(id);
        require(backingVault.balanceOf(HOLDER) == 525e6, "claim paid in receipts");
        backingVault.redeemBounded(25e6, HOLDER, HOLDER, 25e6, block.timestamp);
        vm.stopPrank();
    }

    function testVaultBackingOracleAccountsForFundedGain() public {
        vm.startPrank(HOLDER);
        backing.approve(address(backingVault), 1000e6);
        backingVault.deposit(500e6, HOLDER);
        backingVault.donate(500e6);
        uint256 quoted = IAlpineOracle(factory.backingOracles(address(oracle))).price();
        require(quoted >= 12500000 && quoted <= 12500001, "price denominated in receipt units");
        vm.stopPrank();
    }

    function testTransferPreservesEntryBasisAndExcludesOldOwner() public {
        uint256 id = open();
        vm.prank(HOLDER);
        pool.transferPosition(id, PROVIDER);
        (address owner, uint256 amount, uint256 floor, uint256 opened) = pool.positions(id);
        require(owner == PROVIDER && amount == 1 ether && floor == 25e6 && opened == 10000, "basis preserved");
        vm.prank(HOLDER);
        vm.expectRevert(AlpinePool.NotOwner.selector);
        pool.exitBacking(id);
        vm.prank(PROVIDER);
        pool.exitBacking(id);
        require(pool.reservedBacking() == 0, "new owner closes");
    }

    function testPartialGainThenLossDoesNotDoubleChargeOrLosePrincipal() public {
        uint256 id = open();
        oracle.set(50e6);
        vm.prank(HOLDER);
        pool.partialExitAsset(id, 0.4 ether, 0, block.timestamp);
        require(pool.earned(PROVIDER) == 0.02 ether, "slice gain only");
        oracle.set(10e6);
        vm.prank(HOLDER);
        pool.exitBacking(id);
        require(
            pool.totalBacking() == 985e6 && pool.juniorInventory() == 0.6 ether && pool.reservedBacking() == 0,
            "remaining entry claim exact"
        );
        require(pool.earned(PROVIDER) == 0.02 ether, "no double reward");
    }

    function testProviderDeadlinesRevertAtomically() public {
        vm.prank(PROVIDER);
        vm.expectRevert();
        pool.depositJuniorBounded(10e6, 1, block.timestamp - 1);
        vm.prank(PROVIDER);
        pool.requestJuniorWithdrawal();
        vm.warp(block.timestamp + 121);
        vm.prank(PROVIDER);
        vm.expectRevert();
        pool.withdrawJuniorBounded(100e18, 0, 0, block.timestamp - 1);
        require(pool.shares(PROVIDER) == 1000e18, "expired redemption unchanged");
    }
}
