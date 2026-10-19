// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {AlpinePool} from "../src/AlpinePool.sol";
import {AlpineDemoDollar} from "../src/DemoAssets.sol";
import {
    AlpineBackingVault,
    AlpineWrappedAVAX,
    AlpineDemoVault,
    AlpineVaultOracle,
    AlpineFactory
} from "../src/AlpineMarket.sol";
import {MutableOracle} from "./AlpinePool.t.sol";

interface VmLimits {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function chainId(uint256) external;
    function expectRevert(bytes calldata) external;
}

/// @notice Registry regressions: community creations cannot exhaust the slots featured markets need.
contract AlpineFactoryLimitsTest {
    VmLimits constant vm = VmLimits(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant PROTOCOL = address(0xD);
    AlpineDemoDollar backing;
    AlpineWrappedAVAX wrapper;
    AlpineFactory factory;
    address refOracle;

    function terms() private pure returns (AlpinePool.Terms memory) {
        return AlpinePool.Terms(15000, 1000, 100, 7 days, 60, 120);
    }

    function setUp() public {
        vm.chainId(31337);
        vm.warp(10000);
        backing = new AlpineDemoDollar();
        MutableOracle oracle = new MutableOracle();
        wrapper = new AlpineWrappedAVAX();
        AlpineDemoVault vault = new AlpineDemoVault(backing);
        factory = new AlpineFactory(
            backing,
            PROTOCOL,
            address(wrapper),
            address(vault),
            address(oracle),
            address(oracle),
            address(new AlpineVaultOracle(vault)),
            new AlpineBackingVault(backing)
        );
        refOracle = factory.referenceOracle();
    }

    function _create(address creator) private returns (address) {
        vm.startPrank(creator);
        if (backing.balanceOf(creator) < factory.CREATION_SEED()) {
            vm.warp(block.timestamp + 1 hours);
            backing.faucet();
        }
        backing.approve(address(factory), factory.CREATION_SEED());
        address created = factory.createPool(address(wrapper), refOracle, terms(), block.timestamp);
        vm.stopPrank();
        return created;
    }

    function testCommunityCreatorLimit() public {
        address alice = address(0xA11CE);
        _create(alice);
        _create(alice);
        uint256 seed = factory.CREATION_SEED();
        vm.startPrank(alice);
        backing.approve(address(factory), seed);
        vm.expectRevert(bytes("CREATOR_LIMIT"));
        factory.createPool(address(wrapper), refOracle, terms(), block.timestamp);
        vm.stopPrank();
    }

    function testCommunityCannotTakeProtocolReservedSlots() public {
        uint256 community = factory.MAX_POOLS() - factory.PROTOCOL_RESERVED_POOLS();
        for (uint160 i; i < community; i++) {
            _create(address(0x1000 + i / 2));
        }
        uint256 seed = factory.CREATION_SEED();
        address late = address(0xBEEF);
        vm.startPrank(late);
        backing.faucet();
        backing.approve(address(factory), seed);
        vm.expectRevert(bytes("COMMUNITY_SLOTS_FULL"));
        factory.createPool(address(wrapper), refOracle, terms(), block.timestamp);
        vm.stopPrank();
        // The protocol account can still use every reserved slot, without a per-creator limit.
        for (uint256 i; i < factory.PROTOCOL_RESERVED_POOLS(); i++) {
            _create(PROTOCOL);
        }
        require(factory.allPools().length == factory.MAX_POOLS(), "registry filled by reserved slots");
        vm.startPrank(PROTOCOL);
        backing.approve(address(factory), seed);
        vm.expectRevert(bytes("REGISTRY_FULL"));
        factory.createPool(address(wrapper), refOracle, terms(), block.timestamp);
        vm.stopPrank();
    }
}
