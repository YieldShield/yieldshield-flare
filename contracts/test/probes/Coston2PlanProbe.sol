// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ShieldPool} from "../../src/ShieldPool.sol";
import {ShieldDemoDollar, ShieldScenarioOracle} from "../../src/DemoAssets.sol";
import {ShieldFtsoV2Oracle, IFlareContractRegistry} from "../../src/ShieldFtsoV2Oracle.sol";
import {
    ShieldBackingVault,
    ShieldDemoVault,
    ShieldVaultOracle,
    ShieldFactory,
    ShieldExchange
} from "../../src/ShieldMarket.sol";

interface IWNatLike {
    function deposit() external payable;
}

/// @notice Read-only rehearsal of the whole deployment plan against live Coston2 state.
/// @dev Never deployed. scripts/probe-coston2.mjs installs this runtime code at an unused address
/// with an eth_call state override, gives it test C2FLR there, and calls `simulate`. Every
/// contract is created with the same creation code as the deployment artifacts, so the call checks
/// Coston2's EVM (Cancun opcodes, the chain-114 guard), the real FlareContractRegistry, FtsoV2 and
/// WC2FLR, and the plan's wiring, without signing or broadcasting anything.
contract Coston2PlanProbe {
    struct Result {
        uint256 planGas;
        uint256 price;
        uint256 feedValue;
        int8 feedDecimals;
        uint64 feedTimestamp;
        address ftsoV2;
        uint256 blockNumber;
        uint256 blockTimestamp;
        address factory;
        address referenceOracle;
        uint256 poolCount;
        uint256 nativeFloor;
        uint256 wrappedFloor;
        uint256 exchangeWnat;
        uint256 quoteNativeBuy;
        uint256 exitPreviewOut;
        uint256 wnatDepositGas;
        uint256 wnatTransferGas;
    }

    struct Plan {
        ShieldDemoDollar backing;
        ShieldScenarioOracle scenario;
        ShieldFtsoV2Oracle refOracle;
        ShieldDemoVault vault;
        ShieldBackingVault backingVault;
        ShieldVaultOracle vaultOracle;
        ShieldFactory factory;
        ShieldExchange exchange;
        address referencePool;
        address wrappedPool;
    }

    receive() external payable {}

    function simulate(IFlareContractRegistry registry, bytes21 feedId, uint256 maxAge, address wnat)
        external
        returns (Result memory r)
    {
        uint256 start = gasleft();
        Plan memory p = _deploy(registry, feedId, maxAge, wnat);
        _fund(p, wnat, r);
        _createMarkets(p, wnat);
        _stockExchange(p, wnat, r);
        r.planGas = start - gasleft();
        _holderSteps(p, wnat, r);
        r.price = p.refOracle.price();
        (r.feedValue, r.feedDecimals, r.feedTimestamp) = p.refOracle.latest();
        r.ftsoV2 = p.refOracle.ftsoV2();
        r.blockNumber = block.number;
        r.blockTimestamp = block.timestamp;
        r.factory = address(p.factory);
        r.referenceOracle = address(p.refOracle);
        r.poolCount = p.factory.allPools().length;
    }

    function _deploy(IFlareContractRegistry registry, bytes21 feedId, uint256 maxAge, address wnat)
        private
        returns (Plan memory p)
    {
        p.backing = new ShieldDemoDollar();
        p.scenario = new ShieldScenarioOracle();
        p.refOracle = new ShieldFtsoV2Oracle(registry, feedId, maxAge);
        p.vault = new ShieldDemoVault(p.backing);
        p.backingVault = new ShieldBackingVault(p.backing);
        p.vaultOracle = new ShieldVaultOracle(p.vault);
        p.factory = new ShieldFactory(
            p.backing,
            address(this),
            wnat,
            address(p.vault),
            address(p.refOracle),
            address(p.scenario),
            address(p.vaultOracle),
            p.backingVault
        );
        p.exchange = new ShieldExchange(p.backing, p.factory);
    }

    function _fund(Plan memory p, address wnat, Result memory r) private {
        p.backing.faucet();
        p.backing.approve(address(p.vault), 1000e6);
        p.vault.depositBounded(1000e6, address(this), 1000e18, block.timestamp);
        p.backing.approve(address(p.backingVault), 1000e6);
        p.backingVault.depositBounded(1000e6, address(this), 1000e6, block.timestamp);
        uint256 before = gasleft();
        IWNatLike(wnat).deposit{value: 10 ether}();
        r.wnatDepositGas = before - gasleft();
        p.backing.approve(address(p.factory), 2000e6);
        p.backingVault.approve(address(p.factory), 500e6);
    }

    function _createMarkets(Plan memory p, address wnat) private {
        ShieldPool.Terms memory t = ShieldPool.Terms(15000, 1000, 100, 30 days, 60, 120);
        address cash = address(p.backing);
        p.referencePool = p.factory.createPoolWithBacking(address(0), address(p.refOracle), cash, t, block.timestamp);
        p.factory.createPoolWithBacking(address(0), address(p.scenario), cash, t, block.timestamp);
        p.wrappedPool = p.factory.createPoolWithBacking(wnat, address(p.refOracle), cash, t, block.timestamp);
        p.factory.createPoolWithBacking(address(p.vault), address(p.vaultOracle), cash, t, block.timestamp);
        p.factory.createPoolWithBacking(
            address(0), address(p.refOracle), address(p.backingVault), t, block.timestamp
        );
    }

    function _stockExchange(Plan memory p, address wnat, Result memory r) private {
        require(p.backing.transfer(address(p.exchange), 1000e6), "cash inventory");
        uint256 before = gasleft();
        require(IERC20(wnat).transfer(address(p.exchange), 10 ether), "wrapper inventory");
        r.wnatTransferGas = before - gasleft();
        require(p.vault.transfer(address(p.exchange), 100e18), "vault inventory");
        (bool funded,) = address(p.exchange).call{value: 10 ether}("");
        require(funded, "native inventory");
    }

    /// A holder's first steps on the live feed: native and WC2FLR protection, quotes and previews.
    function _holderSteps(Plan memory p, address wnat, Result memory r) private {
        ShieldPool native = ShieldPool(p.referencePool);
        uint256 nativeId = native.protect{value: 5 ether}(1, block.timestamp);
        (,, r.nativeFloor,) = native.positions(nativeId);
        IWNatLike(wnat).deposit{value: 5 ether}();
        IERC20(wnat).approve(p.wrappedPool, 5 ether);
        uint256 wrappedId = ShieldPool(p.wrappedPool).protectToken(5 ether, 1, block.timestamp);
        (,, r.wrappedFloor,) = ShieldPool(p.wrappedPool).positions(wrappedId);
        (r.exitPreviewOut,) = native.previewExit(nativeId);
        (r.quoteNativeBuy,) = p.exchange.quote(address(0), 2 ether, true);
        r.exchangeWnat = p.exchange.inventory(wnat);
    }
}
