// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AlpinePool, IAlpineOracle} from "./AlpinePool.sol";

contract AlpineWrappedAVAX is ERC20, ReentrancyGuard {
    constructor() ERC20("Alpine Test Wrapped AVAX", "awAVAX") {
        require(block.chainid == 43113 || block.chainid == 31337, "TESTNET_ONLY");
    }

    function deposit() external payable {
        require(msg.value > 0, "ZERO_AMOUNT");
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");
    }
}

contract AlpineDemoVault is ERC4626 {
    using SafeERC20 for IERC20;

    constructor(IERC20 asset_) ERC20("Alpine Demo Vault Receipts", "vaDEMO") ERC4626(asset_) {
        require(block.chainid == 43113 || block.chainid == 31337, "TESTNET_ONLY");
    }

    function _decimalsOffset() internal pure virtual override returns (uint8) {
        return 12;
    }

    function depositBounded(uint256 assets, address receiver, uint256 minShares, uint256 deadline)
        external
        returns (uint256 result)
    {
        require(block.timestamp <= deadline, "DEADLINE");
        result = deposit(assets, receiver);
        require(result >= minShares, "MIN_SHARES");
    }

    function redeemBounded(uint256 shares, address receiver, address owner, uint256 minAssets, uint256 deadline)
        external
        returns (uint256 result)
    {
        require(block.timestamp <= deadline, "DEADLINE");
        result = redeem(shares, receiver, owner);
        require(result >= minAssets, "MIN_ASSETS");
    }

    function donate(uint256 amount) external {
        require(amount > 0, "ZERO_AMOUNT");
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
    }
}

contract AlpineBackingVault is AlpineDemoVault {
    function name() public pure override(ERC20, IERC20Metadata) returns (string memory) {
        return "Alpine Backing Vault";
    }

    function symbol() public pure override(ERC20, IERC20Metadata) returns (string memory) {
        return "bvaDEMO";
    }
    constructor(IERC20 asset_) AlpineDemoVault(asset_) {}

    function _decimalsOffset() internal pure override returns (uint8) {
        return 0;
    }
}

contract AlpineBackingOracle {
    IAlpineOracle public immutable base;
    AlpineBackingVault public immutable vault;

    constructor(IAlpineOracle base_, AlpineBackingVault vault_) {
        base = base_;
        vault = vault_;
    }

    function price() external view returns (uint256) {
        return vault.convertToShares(base.price());
    }
}

contract AlpineVaultOracle {
    AlpineDemoVault public immutable vault;

    constructor(AlpineDemoVault vault_) {
        vault = vault_;
    }

    function price() external view returns (uint256) {
        return vault.convertToAssets(1 ether);
    }
}

contract AlpineFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable backing;
    address public immutable protocol;
    address public immutable wrapper;
    address public immutable vault;
    address public immutable referenceOracle;
    address public immutable scenarioOracle;
    address public immutable vaultOracle;
    AlpineBackingVault public immutable backingVault;
    mapping(address => address) public backingOracles;
    uint256 public constant CREATION_SEED = 500e6;
    uint256 public constant MAX_POOLS = 32;
    /// @notice Slots only the protocol account can fill, so featured markets (and their replacements
    /// after maturity) cannot be crowded out by community creations.
    uint256 public constant PROTOCOL_RESERVED_POOLS = 10;
    /// @notice Community creators are limited per address so the shared registry is costly to fill.
    uint256 public constant MAX_POOLS_PER_CREATOR = 2;
    address[] public pools;
    mapping(address => bool) public isPool;
    mapping(address => uint256) public poolsCreatedBy;
    uint256 public communityPools;
    event PoolCreated(
        address indexed pool, address indexed creator, address indexed asset, address oracle, uint256 seed
    );

    constructor(
        IERC20 backing_,
        address protocol_,
        address wrapper_,
        address vault_,
        address reference_,
        address scenario_,
        address vaultOracle_,
        AlpineBackingVault backingVault_
    ) {
        require(block.chainid == 43113 || block.chainid == 31337, "TESTNET_ONLY");
        backing = backing_;
        protocol = protocol_;
        wrapper = wrapper_;
        vault = vault_;
        referenceOracle = reference_;
        scenarioOracle = scenario_;
        vaultOracle = vaultOracle_;
        backingVault = backingVault_;
        require(backingVault_.asset() == address(backing_), "BACKING_ASSET");
        backingOracles[reference_] = address(new AlpineBackingOracle(IAlpineOracle(reference_), backingVault_));
        backingOracles[scenario_] = address(new AlpineBackingOracle(IAlpineOracle(scenario_), backingVault_));
        backingOracles[vaultOracle_] = address(new AlpineBackingOracle(IAlpineOracle(vaultOracle_), backingVault_));
    }

    function allowed(address asset, address oracle_) public view returns (bool) {
        return (asset == address(0) && (oracle_ == referenceOracle || oracle_ == scenarioOracle))
            || (asset == wrapper && oracle_ == referenceOracle) || (asset == vault && oracle_ == vaultOracle);
    }

    function allPools() external view returns (address[] memory) {
        return pools;
    }

    function createPool(address asset, address oracle_, AlpinePool.Terms calldata terms, uint256 deadline)
        external
        nonReentrant
        returns (address)
    {
        return _create(asset, oracle_, address(backing), terms, deadline);
    }

    function createPoolWithBacking(
        address asset,
        address oracle_,
        address backing_,
        AlpinePool.Terms calldata terms,
        uint256 deadline
    ) external nonReentrant returns (address) {
        return _create(asset, oracle_, backing_, terms, deadline);
    }

    function _create(
        address asset,
        address oracle_,
        address backing_,
        AlpinePool.Terms calldata terms,
        uint256 deadline
    ) private returns (address pool) {
        require(block.timestamp <= deadline, "DEADLINE");
        require(pools.length < MAX_POOLS, "REGISTRY_FULL");
        if (msg.sender != protocol) {
            require(communityPools < MAX_POOLS - PROTOCOL_RESERVED_POOLS, "COMMUNITY_SLOTS_FULL");
            require(poolsCreatedBy[msg.sender] < MAX_POOLS_PER_CREATOR, "CREATOR_LIMIT");
            communityPools++;
        }
        poolsCreatedBy[msg.sender]++;
        require(allowed(asset, oracle_), "UNAPPROVED_PAIR");
        require(backing_ == address(backing) || backing_ == address(backingVault), "UNAPPROVED_BACKING");
        address priced = backing_ == address(backing) ? oracle_ : backingOracles[oracle_];
        require(IAlpineOracle(priced).price() > 0, "INVALID_PRICE");
        AlpinePool market = new AlpinePool(backing_, priced, msg.sender, protocol, asset, terms);
        pool = address(market);
        IERC20 seed = IERC20(backing_);
        uint256 beforeBalance = seed.balanceOf(address(this));
        seed.safeTransferFrom(msg.sender, address(this), CREATION_SEED);
        require(seed.balanceOf(address(this)) - beforeBalance == CREATION_SEED, "EXACT_TRANSFER_ONLY");
        seed.forceApprove(pool, CREATION_SEED);
        market.seedCreator(CREATION_SEED);
        pools.push(pool);
        isPool[pool] = true;
        emit PoolCreated(pool, msg.sender, asset, priced, CREATION_SEED);
    }
}

/// @notice Funded valueless test exchange. No virtual inventory and no unlimited asset minting.
contract AlpineExchange is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable backing;
    AlpineFactory public immutable registry;
    uint256 public constant FEE_BPS = 30;
    event Traded(
        address indexed owner, address indexed asset, bool buy, uint256 amount, uint256 backingAmount, uint256 fee
    );
    /// @notice Inventory added to the exchange (asset zero is native AVAX).
    event InventoryFunded(address indexed asset, address indexed from, uint256 amount);

    constructor(IERC20 backing_, AlpineFactory registry_) {
        require(block.chainid == 43113 || block.chainid == 31337, "TESTNET_ONLY");
        backing = backing_;
        registry = registry_;
    }
    receive() external payable {
        emit InventoryFunded(address(0), msg.sender, msg.value);
    }

    function fundToken(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit InventoryFunded(token, msg.sender, amount);
    }

    function oracle(address asset) public view returns (address) {
        if (asset == address(0) || asset == registry.wrapper()) return registry.referenceOracle();
        if (asset == registry.vault()) return registry.vaultOracle();
        revert("UNSUPPORTED_ASSET");
    }

    function quote(address asset, uint256 amount, bool isBuy) public view returns (uint256 amountBacking, uint256 fee) {
        require(amount > 0 && amount <= 100_000 ether, "AMOUNT_LIMIT");
        uint256 price = IAlpineOracle(oracle(asset)).price();
        require(price > 0, "INVALID_PRICE");
        uint256 base = Math.mulDiv(amount, price, 1 ether, isBuy ? Math.Rounding.Ceil : Math.Rounding.Floor);
        require(base > 0, "DUST_QUOTE");
        fee = Math.mulDiv(base, FEE_BPS, 10000, Math.Rounding.Ceil);
        amountBacking = isBuy ? base + fee : base - fee;
        require(amountBacking > 0, "DUST_QUOTE");
    }

    function inventory(address asset) external view returns (uint256) {
        return asset == address(0) ? address(this).balance : IERC20(asset).balanceOf(address(this));
    }

    function buy(address asset, uint256 amount, uint256 maxBacking, uint256 deadline) external nonReentrant {
        require(block.timestamp <= deadline, "DEADLINE");
        (uint256 cost, uint256 fee) = quote(asset, amount, true);
        require(cost <= maxBacking, "MAX_SPEND");
        backing.safeTransferFrom(msg.sender, address(this), cost);
        if (asset == address(0)) {
            (bool ok,) = msg.sender.call{value: amount}("");
            require(ok, "INSUFFICIENT_NATIVE_INVENTORY");
        } else {
            IERC20(asset).safeTransfer(msg.sender, amount);
        }
        emit Traded(msg.sender, asset, true, amount, cost, fee);
    }

    function sellNative(uint256 minBacking, uint256 deadline) external payable nonReentrant {
        _sell(address(0), msg.value, minBacking, deadline);
    }

    function sellToken(address asset, uint256 amount, uint256 minBacking, uint256 deadline) external nonReentrant {
        require(asset != address(0), "USE_NATIVE_FUNCTION");
        oracle(asset);
        uint256 beforeBalance = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        require(IERC20(asset).balanceOf(address(this)) - beforeBalance == amount, "EXACT_TRANSFER_ONLY");
        _sell(asset, amount, minBacking, deadline);
    }

    function _sell(address asset, uint256 amount, uint256 minBacking, uint256 deadline) private {
        require(block.timestamp <= deadline, "DEADLINE");
        (uint256 received, uint256 fee) = quote(asset, amount, false);
        require(received >= minBacking, "MIN_PROCEEDS");
        backing.safeTransfer(msg.sender, received);
        emit Traded(msg.sender, asset, false, amount, received, fee);
    }
}
