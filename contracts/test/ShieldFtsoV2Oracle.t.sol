// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ShieldFtsoV2Oracle, IFlareContractRegistry} from "../src/ShieldFtsoV2Oracle.sol";
import {ShieldPool, IShieldOracle} from "../src/ShieldPool.sol";
import {ShieldDemoDollar, ShieldScenarioOracle} from "../src/DemoAssets.sol";
import {ShieldBackingVault, ShieldDemoVault, ShieldVaultOracle, ShieldFactory} from "../src/ShieldMarket.sol";
import {MockFlareContractRegistry, MockFtsoV2, MutatingFtsoV2, MockWNat} from "./mocks/FlareMocks.sol";

interface VmFtso {
    function deal(address, uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function chainId(uint256) external;
    function expectRevert() external;
    function expectRevert(bytes calldata) external;
}

/// @notice Shared Coston2-like setup: a registry resolving FtsoV2, with FLR/USD and XRP/USD feeds.
abstract contract FtsoFixture {
    VmFtso constant vm = VmFtso(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes21 constant FLR_USD = 0x01464c522f55534400000000000000000000000000;
    bytes21 constant XRP_USD = 0x015852502f55534400000000000000000000000000;
    bytes21 constant UNKNOWN = 0x01554e4b4e4f574e00000000000000000000000000;
    uint256 constant MAX_AGE = 300;
    MockFlareContractRegistry registry;
    MockFtsoV2 ftso;

    function _fixture() internal {
        vm.chainId(31337);
        vm.warp(1_000_000);
        registry = new MockFlareContractRegistry();
        ftso = new MockFtsoV2();
        registry.setContractAddress("FtsoV2", address(ftso));
        // Values read from Coston2 on 19 October 2026.
        ftso.setFeed(FLR_USD, 639928, 8);
        ftso.setFeed(XRP_USD, 1313551, 6);
    }

    function _adapter(bytes21 id) internal returns (ShieldFtsoV2Oracle) {
        return new ShieldFtsoV2Oracle(IFlareContractRegistry(address(registry)), id, MAX_AGE);
    }
}

contract ShieldFtsoV2OracleTest is FtsoFixture {
    ShieldFtsoV2Oracle flr;

    function setUp() public {
        _fixture();
        flr = _adapter(FLR_USD);
    }

    function testNormalizesCoston2FeedsToBackingUnits() public {
        require(flr.price() == 6399, "FLR/USD 0.00639928 -> 6399 micro-units");
        require(_adapter(XRP_USD).price() == 1313551, "XRP/USD already has 6 decimals");
        (uint256 value, int8 decimals, uint64 timestamp) = flr.latest();
        require(value == 639928 && decimals == 8 && timestamp == block.timestamp, "raw reading");
        require(flr.ftsoV2() == address(ftso) && flr.maxAge() == MAX_AGE && flr.feedId() == FLR_USD, "wiring");
    }

    function testNormalizesFewerZeroNegativeAndEighteenDecimals() public {
        ftso.setFeed(FLR_USD, 12345, 2);
        require(flr.price() == 123.45e6, "2 decimals scale up");
        ftso.setFeed(FLR_USD, 7, 0);
        require(flr.price() == 7e6, "0 decimals");
        ftso.setFeed(FLR_USD, 5, -2);
        require(flr.price() == 500e6, "negative decimals multiply");
        ftso.setFeed(FLR_USD, 6399280000000000, 18);
        require(flr.price() == 6399, "18 decimals truncate");
    }

    function testFuzzNormalizationMatchesDecimalShift(uint64 value, int8 rawDecimals) public {
        int8 decimals = int8(int256(rawDecimals) % 19);
        ftso.setFeed(FLR_USD, value, decimals);
        uint256 expected = value;
        if (decimals > 6) {
            for (int8 i = 6; i < decimals; i++) {
                expected /= 10;
            }
        } else {
            for (int8 i = decimals; i < 6; i++) {
                expected *= 10;
            }
        }
        if (expected == 0) {
            vm.expectRevert(bytes("ZERO_PRICE"));
            flr.price();
        } else {
            require(flr.price() == expected, "normalized");
        }
    }

    function testRejectsZeroValueAndDustThatNormalizesToZero() public {
        ftso.setFeed(FLR_USD, 0, 8);
        vm.expectRevert(bytes("ZERO_PRICE"));
        flr.price();
        ftso.setFeed(FLR_USD, 99, 8);
        vm.expectRevert(bytes("ZERO_PRICE"));
        flr.price();
    }

    function testFreshnessBoundary() public {
        ftso.setFeedTimestamp(FLR_USD, uint64(block.timestamp - MAX_AGE));
        require(flr.price() == 6399, "exactly maxAge is accepted");
        ftso.setFeedTimestamp(FLR_USD, uint64(block.timestamp - MAX_AGE - 1));
        vm.expectRevert(bytes("STALE_PRICE"));
        flr.price();
    }

    function testFeedGoesStaleWhenUpdatesStop() public {
        ftso.setFeedTimestamp(FLR_USD, uint64(block.timestamp));
        vm.warp(block.timestamp + MAX_AGE + 1);
        vm.expectRevert(bytes("STALE_PRICE"));
        flr.price();
    }

    function testRejectsZeroAndFutureTimestamps() public {
        ftso.setFeedTimestamp(FLR_USD, 0);
        vm.expectRevert(bytes("INVALID_TIMESTAMP"));
        flr.price();
        ftso.setFeedTimestamp(FLR_USD, uint64(block.timestamp + 1));
        vm.expectRevert(bytes("INVALID_TIMESTAMP"));
        flr.price();
    }

    function testRejectsOutOfRangeDecimals() public {
        ftso.setFeed(FLR_USD, 639928, 19);
        vm.expectRevert(bytes("FEED_DECIMALS"));
        flr.price();
        ftso.setFeed(FLR_USD, 639928, -19);
        vm.expectRevert(bytes("FEED_DECIMALS"));
        flr.price();
    }

    function testReadFeeIntroductionFailsClosed() public {
        ftso.setFee(1);
        vm.expectRevert(bytes("FEE_REQUIRED"));
        flr.price();
        vm.expectRevert(bytes("FEE_REQUIRED"));
        flr.latest();
        ftso.setFee(0);
        require(flr.price() == 6399, "recovers when the fee is zero again");
    }

    function testUnknownFeedAndMissingFtsoFailDeploymentAndReads() public {
        vm.expectRevert(bytes("feed not supported"));
        _adapter(UNKNOWN);
        registry.setContractAddress("FtsoV2", address(0));
        vm.expectRevert(bytes("NO_FTSO_V2"));
        flr.price();
        vm.expectRevert(bytes("NO_FTSO_V2"));
        _adapter(FLR_USD);
    }

    function testFollowsRegistryToReplacementFtso() public {
        MockFtsoV2 replacement = new MockFtsoV2();
        replacement.setFeed(FLR_USD, 700000, 8);
        registry.setContractAddress("FtsoV2", address(replacement));
        require(flr.ftsoV2() == address(replacement) && flr.price() == 7000, "resolved on every read");
    }

    function testReadsAreStaticCalls() public {
        MutatingFtsoV2 mutating = new MutatingFtsoV2();
        registry.setContractAddress("FtsoV2", address(mutating));
        vm.expectRevert();
        flr.price();
        require(mutating.reads() == 0, "a state-changing read cannot succeed through the adapter");
    }

    function testConstructorBounds() public {
        IFlareContractRegistry r = IFlareContractRegistry(address(registry));
        vm.expectRevert(bytes("MAX_AGE"));
        new ShieldFtsoV2Oracle(r, FLR_USD, 0);
        vm.expectRevert(bytes("MAX_AGE"));
        new ShieldFtsoV2Oracle(r, FLR_USD, 1 hours + 1);
        vm.expectRevert(bytes("FEED_ID"));
        new ShieldFtsoV2Oracle(r, bytes21(0), MAX_AGE);
        vm.expectRevert(bytes("REGISTRY"));
        new ShieldFtsoV2Oracle(IFlareContractRegistry(address(0xBEEF)), FLR_USD, MAX_AGE);
        vm.chainId(14);
        vm.expectRevert(bytes("TESTNET_ONLY"));
        new ShieldFtsoV2Oracle(r, FLR_USD, MAX_AGE);
        vm.chainId(114);
        require(new ShieldFtsoV2Oracle(r, FLR_USD, MAX_AGE).price() == 6399, "Coston2 chain id accepted");
    }
}

/// @notice The adapter inside real markets: gain fees, fail-closed staleness, factory admission.
contract ShieldFtsoV2IntegrationTest is FtsoFixture {
    address constant HOLDER = address(0xA11CE);
    address constant PROVIDER = address(0xB0B);
    address constant CREATOR = address(0xC);
    address constant PROTOCOL = address(0xD);
    ShieldDemoDollar backing;
    ShieldFtsoV2Oracle flr;
    ShieldPool pool;

    function terms() private pure returns (ShieldPool.Terms memory) {
        return ShieldPool.Terms(15000, 1000, 100, 30 days, 60, 120);
    }

    function setUp() public {
        _fixture();
        backing = new ShieldDemoDollar();
        flr = _adapter(FLR_USD);
        pool = new ShieldPool(address(backing), address(flr), CREATOR, PROTOCOL, address(0), terms());
        vm.deal(HOLDER, 10_000 ether);
        vm.startPrank(PROVIDER);
        backing.faucet();
        backing.approve(address(pool), type(uint256).max);
        pool.depositJunior(1000e6, 1);
        vm.stopPrank();
    }

    function testGainExitPaysFeesAtTheFeedPrice() public {
        vm.prank(HOLDER);
        uint256 id = pool.protect{value: 1000 ether}(1, block.timestamp);
        (, uint256 amount, uint256 floor,) = pool.positions(id);
        require(amount == 1000 ether && floor == 6_399_000, "1000 C2FLR at 6399 micro-units each");
        vm.warp(block.timestamp + 61);
        ftso.setFeed(FLR_USD, 1279856, 8); // FLR/USD doubles
        (uint256 out, uint256 fee) = pool.previewExit(id);
        require(fee == 60 ether && out == 940 ether, "12% of the 500 C2FLR gain");
        vm.prank(HOLDER);
        pool.exitAsset(id, out);
        require(pool.rewardInventory() == 50 ether && pool.otherFeeInventory() == 10 ether, "fee split");
    }

    function testStaleFeedBlocksPricedActionsButNotBackingExit() public {
        vm.prank(HOLDER);
        uint256 id = pool.protect{value: 1000 ether}(1, block.timestamp);
        vm.warp(block.timestamp + 61);
        ftso.setFeedTimestamp(FLR_USD, uint64(block.timestamp - MAX_AGE - 1));
        vm.prank(HOLDER);
        vm.expectRevert(bytes("STALE_PRICE"));
        pool.protect{value: 1000 ether}(1, block.timestamp);
        vm.prank(HOLDER);
        vm.expectRevert(bytes("STALE_PRICE"));
        pool.exitAsset(id, 0);
        vm.prank(HOLDER);
        pool.exitBacking(id);
        require(backing.balanceOf(HOLDER) == 6_399_000, "fixed backing claim paid without a price");
        require(pool.reservedBacking() == 0 && pool.juniorInventory() == 1000 ether, "asset surrendered");
    }

    function testFactoryAdmitsMarketsOnlyOnAFreshFeed() public {
        MockWNat wnat = new MockWNat();
        ShieldDemoVault vault = new ShieldDemoVault(backing);
        ShieldBackingVault backingVault = new ShieldBackingVault(backing);
        ShieldFactory factory = new ShieldFactory(
            backing,
            PROTOCOL,
            address(wnat),
            address(vault),
            address(flr),
            address(new ShieldScenarioOracle()),
            address(new ShieldVaultOracle(vault)),
            backingVault
        );
        vm.startPrank(HOLDER);
        backing.faucet();
        backing.approve(address(factory), type(uint256).max);
        backing.approve(address(backingVault), type(uint256).max);
        backingVault.deposit(1000e6, HOLDER);
        backingVault.approve(address(factory), type(uint256).max);
        ftso.setFeedTimestamp(FLR_USD, uint64(block.timestamp - MAX_AGE - 1));
        vm.expectRevert(bytes("STALE_PRICE"));
        factory.createPool(address(wnat), address(flr), terms(), block.timestamp);
        ftso.setFeed(FLR_USD, 639928, 8);
        ShieldPool wrapped = ShieldPool(factory.createPool(address(wnat), address(flr), terms(), block.timestamp));
        require(address(wrapped.oracle()) == address(flr) && wrapped.protectedToken() == address(wnat), "wiring");
        ShieldPool vaultBacked = ShieldPool(
            factory.createPoolWithBacking(address(0), address(flr), address(backingVault), terms(), block.timestamp)
        );
        require(IShieldOracle(address(vaultBacked.oracle())).price() == 6399, "1:1 receipts price the same");
        vm.stopPrank();
    }

    function testCanonicalWrapperFlowWithMockWNat() public {
        MockWNat wnat = new MockWNat();
        vm.startPrank(HOLDER);
        wnat.deposit{value: 5 ether}();
        require(wnat.balanceOf(HOLDER) == 5 ether && address(wnat).balance == 5 ether, "1:1 wrap");
        uint256 before = HOLDER.balance;
        wnat.withdraw(2 ether);
        require(HOLDER.balance - before == 2 ether && wnat.totalSupply() == 3 ether, "1:1 unwrap");
        vm.stopPrank();
    }
}
