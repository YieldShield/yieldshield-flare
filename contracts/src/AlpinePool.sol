// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

interface IAlpineOracle {
    function price() external view returns (uint256);
}

/// @notice Bounded testnet split-risk market. Protected assets have18 decimals; backing has6.
contract AlpinePool is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    struct Terms {
        uint16 collateralBps;
        uint16 juniorFeeBps;
        uint16 creatorFeeBps;
        uint32 epochSeconds;
        uint32 exitDelay;
        uint32 juniorNotice;
    }

    struct Position {
        address owner;
        uint256 amount;
        uint256 floor;
        uint256 openedAt;
    }
    IERC20 public immutable backing;
    address public immutable protectedToken; // zero means native test AVAX
    IAlpineOracle public immutable oracle;
    address public immutable creator;
    address public immutable protocol;
    address private immutable initializer;
    Terms public terms;
    uint256 public immutable maturity;
    uint256 public constant PROTOCOL_FEE_BPS = 100;
    /// @notice Bound on concurrently open positions; closed positions free their slot.
    uint256 public constant MAX_POSITIONS = 100;
    /// @notice Smallest entry floor (0.01 backing unit), so open slots cannot be filled with dust.
    uint256 public constant MIN_FLOOR = 10_000;
    uint256 private constant RAY = 1e27;
    uint256 public totalBacking;
    uint256 public reservedBacking;
    uint256 public protectedBalance;
    uint256 public juniorInventory;
    uint256 public rewardInventory;
    uint256 public otherFeeInventory;
    uint256 public rewardPerShare;
    uint256 public totalShares;
    uint256 public totalClaimableBacking;
    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;
    EnumerableSet.UintSet private openIds;
    mapping(address => uint256) public shares;
    mapping(address => uint256) public withdrawalReadyAt;
    mapping(address => uint256) public claimableBacking;
    mapping(address => uint256) public claimableFees;
    mapping(address => uint256) private rewardPerSharePaid;
    mapping(address => uint256) private pendingRewards;
    event PositionTransferred(uint256 indexed id, address indexed from, address indexed to);
    event Protected(uint256 indexed id, address indexed owner, uint256 amount, uint256 floor);
    event Exited(uint256 indexed id, address indexed owner, bool backingExit, uint256 amount, uint256 received);
    event GainFeesCharged(uint256 indexed id, uint256 providerReward, uint256 creatorFee, uint256 protocolFee);
    event Expired(uint256 indexed id, address indexed owner, uint256 backingCredited);
    event BackingClaimed(address indexed owner, uint256 amount);
    event JuniorDeposited(address indexed owner, uint256 backingAmount, uint256 sharesMinted);
    event JuniorWithdrawalRequested(address indexed owner, uint256 readyAt);
    event JuniorWithdrawalCancelled(address indexed owner);
    event JuniorWithdrawn(address indexed owner, uint256 sharesBurned, uint256 backingAmount, uint256 assetAmount);
    event RewardsClaimed(address indexed owner, address indexed recipient, uint256 amount);
    event FeesClaimed(address indexed owner, address indexed recipient, uint256 amount);
    error InvalidAmount();
    error InsufficientBacking();
    error Slippage();
    error NotReady();
    error NotOwner();
    error TransferFailed();
    error ActiveExposure();
    error EpochClosed();
    error PositionLimit();

    constructor(
        address backing_,
        address oracle_,
        address creator_,
        address protocol_,
        address protectedToken_,
        Terms memory terms_
    ) {
        require(block.chainid == 43113 || block.chainid == 31337, "TESTNET_ONLY");
        require(creator_ != address(0) && protocol_ != address(0), "ZERO_RECIPIENT");
        require(IERC20Metadata(backing_).decimals() == 6, "BACKING_DECIMALS");
        require(protectedToken_ == address(0) || IERC20Metadata(protectedToken_).decimals() == 18, "ASSET_DECIMALS");
        require(terms_.collateralBps >= 12500 && terms_.collateralBps <= 30000, "COLLATERAL_LIMIT");
        require(
            terms_.juniorFeeBps <= 2000 && terms_.creatorFeeBps <= 500
                && uint256(terms_.juniorFeeBps) + terms_.creatorFeeBps + PROTOCOL_FEE_BPS <= 2500,
            "FEE_LIMIT"
        );
        require(terms_.epochSeconds >= 1 days && terms_.epochSeconds <= 30 days, "EPOCH_LIMIT");
        require(
            terms_.exitDelay >= 60 && terms_.exitDelay <= 1 hours && terms_.juniorNotice >= 120
                && terms_.juniorNotice <= 1 days,
            "DELAY_LIMIT"
        );
        backing = IERC20(backing_);
        oracle = IAlpineOracle(oracle_);
        creator = creator_;
        protocol = protocol_;
        protectedToken = protectedToken_;
        terms = terms_;
        maturity = block.timestamp + terms_.epochSeconds;
        initializer = msg.sender;
    }

    function requiredBacking(uint256 reserved) public view returns (uint256) {
        return Math.mulDiv(reserved, terms.collateralBps, 10000, Math.Rounding.Ceil);
    }

    /// @notice Ids of every open position (at most MAX_POSITIONS), for settlement and ownership discovery.
    function openPositionIds() external view returns (uint256[] memory) {
        return openIds.values();
    }

    function capacity() external view returns (uint256) {
        uint256 maximum = totalBacking * 10000 / terms.collateralBps;
        return maximum > reservedBacking ? maximum - reservedBacking : 0;
    }

    function juniorValue() public view returns (uint256) {
        return totalBacking + (juniorInventory == 0 ? 0 : Math.mulDiv(juniorInventory, oracle.price(), 1 ether));
    }

    /// @dev Accrues against a per-owner index snapshot. A rounded debt would credit up to one extra unit
    /// per share change, letting total earnings exceed the reward inventory.
    function earned(address owner) public view returns (uint256) {
        return pendingRewards[owner] + Math.mulDiv(shares[owner], rewardPerShare - rewardPerSharePaid[owner], RAY);
    }

    function _checkpoint(address owner) private {
        pendingRewards[owner] = earned(owner);
        rewardPerSharePaid[owner] = rewardPerShare;
    }

    function depositJunior(uint256 amount, uint256 minShares) external nonReentrant returns (uint256) {
        return _depositJunior(msg.sender, amount, minShares);
    }

    function depositJuniorBounded(uint256 amount, uint256 minShares, uint256 deadline)
        external
        nonReentrant
        returns (uint256)
    {
        require(block.timestamp <= deadline, "DEADLINE");
        return _depositJunior(msg.sender, amount, minShares);
    }

    /// @notice The creating factory atomically credits its creation seed to the creator, not to itself.
    function seedCreator(uint256 amount) external nonReentrant returns (uint256) {
        require(msg.sender == initializer && totalShares == 0 && nextPositionId == 1, "INITIAL_SEED_ONLY");
        return _depositJunior(creator, amount, 1);
    }

    function _depositJunior(address owner, uint256 amount, uint256 minShares) private returns (uint256 minted) {
        if (reservedBacking != 0) revert ActiveExposure();
        if (block.timestamp >= maturity) revert EpochClosed();
        if (amount == 0 || amount > 1_000_000e6) revert InvalidAmount();
        uint256 nav = juniorValue();
        minted = totalShares == 0 ? amount * 1e12 : (nav == 0 ? 0 : Math.mulDiv(amount, totalShares, nav));
        if (minted == 0 || minted < minShares) revert Slippage();
        _checkpoint(owner);
        uint256 beforeBalance = backing.balanceOf(address(this));
        backing.safeTransferFrom(msg.sender, address(this), amount);
        require(backing.balanceOf(address(this)) - beforeBalance == amount, "EXACT_TRANSFER_ONLY");
        totalBacking += amount;
        totalShares += minted;
        shares[owner] += minted;
        withdrawalReadyAt[owner] = 0;
        emit JuniorDeposited(owner, amount, minted);
    }

    function requestJuniorWithdrawal() external {
        if (shares[msg.sender] == 0) revert InvalidAmount();
        withdrawalReadyAt[msg.sender] = block.timestamp + terms.juniorNotice;
        emit JuniorWithdrawalRequested(msg.sender, withdrawalReadyAt[msg.sender]);
    }

    function cancelJuniorWithdrawal() external {
        if (withdrawalReadyAt[msg.sender] == 0) revert NotReady();
        withdrawalReadyAt[msg.sender] = 0;
        emit JuniorWithdrawalCancelled(msg.sender);
    }

    function previewJuniorWithdrawal(address owner, uint256 burn)
        public
        view
        returns (uint256 backingOut, uint256 assetOut)
    {
        if (burn == 0 || burn > shares[owner]) revert InvalidAmount();
        return (Math.mulDiv(totalBacking, burn, totalShares), Math.mulDiv(juniorInventory, burn, totalShares));
    }

    function withdrawJunior(uint256 burn, uint256 minBacking, uint256 minAsset) external nonReentrant {
        _withdrawJunior(burn, minBacking, minAsset);
    }

    function withdrawJuniorBounded(uint256 burn, uint256 minBacking, uint256 minAsset, uint256 deadline)
        external
        nonReentrant
    {
        require(block.timestamp <= deadline, "DEADLINE");
        _withdrawJunior(burn, minBacking, minAsset);
    }

    function _withdrawJunior(uint256 burn, uint256 minBacking, uint256 minAsset) private {
        if (reservedBacking != 0) revert ActiveExposure();
        uint256 ready = withdrawalReadyAt[msg.sender];
        if (ready == 0 || block.timestamp < ready) revert NotReady();
        (uint256 stableOut, uint256 assetOut) = previewJuniorWithdrawal(msg.sender, burn);
        if (stableOut < minBacking || assetOut < minAsset) revert Slippage();
        if (totalBacking - stableOut < requiredBacking(reservedBacking)) revert InsufficientBacking();
        _checkpoint(msg.sender);
        shares[msg.sender] -= burn;
        totalShares -= burn;
        totalBacking -= stableOut;
        juniorInventory -= assetOut;
        withdrawalReadyAt[msg.sender] = 0;
        backing.safeTransfer(msg.sender, stableOut);
        _sendAsset(msg.sender, assetOut);
        emit JuniorWithdrawn(msg.sender, burn, stableOut, assetOut);
    }

    function claimRewards(address recipient) external nonReentrant {
        require(recipient != address(0), "ZERO_RECIPIENT");
        _checkpoint(msg.sender);
        uint256 amount = pendingRewards[msg.sender];
        if (amount == 0) revert InvalidAmount();
        pendingRewards[msg.sender] = 0;
        rewardInventory -= amount;
        _sendAsset(recipient, amount);
        emit RewardsClaimed(msg.sender, recipient, amount);
    }

    function claimFees(address recipient) external nonReentrant {
        require(recipient != address(0), "ZERO_RECIPIENT");
        uint256 amount = claimableFees[msg.sender];
        if (amount == 0) revert InvalidAmount();
        claimableFees[msg.sender] = 0;
        otherFeeInventory -= amount;
        _sendAsset(recipient, amount);
        emit FeesClaimed(msg.sender, recipient, amount);
    }

    function protect(uint256 minFloor, uint256 deadline) external payable nonReentrant returns (uint256) {
        require(protectedToken == address(0), "TOKEN_MARKET");
        return _protect(msg.value, minFloor, deadline);
    }

    function protectToken(uint256 amount, uint256 minFloor, uint256 deadline) external nonReentrant returns (uint256) {
        require(protectedToken != address(0), "NATIVE_MARKET");
        uint256 beforeBalance = IERC20(protectedToken).balanceOf(address(this));
        IERC20(protectedToken).safeTransferFrom(msg.sender, address(this), amount);
        require(IERC20(protectedToken).balanceOf(address(this)) - beforeBalance == amount, "EXACT_TRANSFER_ONLY");
        return _protect(amount, minFloor, deadline);
    }

    function _protect(uint256 amount, uint256 minFloor, uint256 deadline) private returns (uint256 id) {
        if (block.timestamp + terms.exitDelay >= maturity) revert EpochClosed();
        if (openIds.length() >= MAX_POSITIONS) revert PositionLimit();
        if (amount == 0 || amount > 100_000 ether) revert InvalidAmount();
        require(block.timestamp <= deadline, "DEADLINE");
        uint256 floor = Math.mulDiv(amount, oracle.price(), 1 ether);
        if (floor < MIN_FLOOR) revert InvalidAmount();
        if (floor < minFloor) revert Slippage();
        if (totalBacking < requiredBacking(reservedBacking + floor)) revert InsufficientBacking();
        id = nextPositionId++;
        openIds.add(id);
        positions[id] = Position(msg.sender, amount, floor, block.timestamp);
        reservedBacking += floor;
        protectedBalance += amount;
        emit Protected(id, msg.sender, amount, floor);
    }

    function transferPosition(uint256 id, address recipient) external {
        Position storage p = positions[id];
        if (p.owner != msg.sender) revert NotOwner();
        require(recipient != address(0) && recipient != msg.sender, "INVALID_RECIPIENT");
        if (block.timestamp >= maturity) revert EpochClosed();
        p.owner = recipient;
        emit PositionTransferred(id, msg.sender, recipient);
    }

    function previewPartialExit(uint256 id, uint256 amount)
        public
        view
        returns (uint256 assetOut, uint256 fee, uint256 floorOut)
    {
        Position memory p = positions[id];
        if (p.owner == address(0)) revert NotOwner();
        if (amount == 0 || amount > p.amount) revert InvalidAmount();
        floorOut = amount == p.amount ? p.floor : Math.mulDiv(p.floor, amount, p.amount);
        uint256 spot = oracle.price();
        uint256 nowValue = Math.mulDiv(amount, spot, 1 ether);
        uint256 gain = nowValue > floorOut ? Math.mulDiv(nowValue - floorOut, 1 ether, spot) : 0;
        fee = Math.mulDiv(gain, terms.juniorFeeBps, 10000) + Math.mulDiv(gain, terms.creatorFeeBps, 10000)
            + Math.mulDiv(gain, PROTOCOL_FEE_BPS, 10000);
        assetOut = amount - fee;
    }

    function previewExit(uint256 id) external view returns (uint256 out, uint256 fee) {
        (out, fee,) = previewPartialExit(id, positions[id].amount);
    }

    function exitAvax(uint256 id, uint256 minAsset) external nonReentrant {
        _exitAsset(id, positions[id].amount, minAsset);
    }

    function partialExitAsset(uint256 id, uint256 amount, uint256 minAsset, uint256 deadline) external nonReentrant {
        require(block.timestamp <= deadline, "DEADLINE");
        _exitAsset(id, amount, minAsset);
    }

    function _exitAsset(uint256 id, uint256 amount, uint256 minAsset) private {
        if (block.timestamp >= maturity) revert EpochClosed();
        Position memory p = _position(id);
        (uint256 out,, uint256 floorOut) = previewPartialExit(id, amount);
        if (out < minAsset) revert Slippage();
        uint256 spot = oracle.price();
        uint256 value = Math.mulDiv(amount, spot, 1 ether);
        uint256 gain = value > floorOut ? Math.mulDiv(value - floorOut, 1 ether, spot) : 0;
        uint256 reward = Math.mulDiv(gain, terms.juniorFeeBps, 10000);
        uint256 creatorFee = Math.mulDiv(gain, terms.creatorFeeBps, 10000);
        uint256 protocolFee = Math.mulDiv(gain, PROTOCOL_FEE_BPS, 10000);
        _reduce(id, p, amount, floorOut);
        if (reward > 0) {
            rewardInventory += reward;
            rewardPerShare += Math.mulDiv(reward, RAY, totalShares);
        }
        claimableFees[creator] += creatorFee;
        claimableFees[protocol] += protocolFee;
        otherFeeInventory += creatorFee + protocolFee;
        _sendAsset(msg.sender, out);
        if (reward + creatorFee + protocolFee > 0) emit GainFeesCharged(id, reward, creatorFee, protocolFee);
        emit Exited(id, msg.sender, false, amount, out);
    }

    function exitBacking(uint256 id) external nonReentrant {
        _exitBacking(id, positions[id].amount, 0);
    }

    function partialExitBacking(uint256 id, uint256 amount, uint256 minBacking, uint256 deadline)
        external
        nonReentrant
    {
        require(block.timestamp <= deadline, "DEADLINE");
        _exitBacking(id, amount, minBacking);
    }

    function _exitBacking(uint256 id, uint256 amount, uint256 minimum) private {
        Position memory p = _position(id);
        if (amount == 0 || amount > p.amount) revert InvalidAmount();
        uint256 floorOut = amount == p.amount ? p.floor : Math.mulDiv(p.floor, amount, p.amount);
        if (floorOut == 0) revert InvalidAmount();
        if (floorOut < minimum) revert Slippage();
        _reduce(id, p, amount, floorOut);
        totalBacking -= floorOut;
        juniorInventory += amount;
        backing.safeTransfer(msg.sender, floorOut);
        emit Exited(id, msg.sender, true, amount, floorOut);
    }

    function settleExpired(uint256 id) external nonReentrant {
        if (block.timestamp < maturity) revert NotReady();
        Position memory p = positions[id];
        if (p.owner == address(0)) revert NotOwner();
        _reduce(id, p, p.amount, p.floor);
        totalBacking -= p.floor;
        juniorInventory += p.amount;
        claimableBacking[p.owner] += p.floor;
        totalClaimableBacking += p.floor;
        emit Expired(id, p.owner, p.floor);
    }

    function claimBacking() external nonReentrant {
        uint256 amount = claimableBacking[msg.sender];
        if (amount == 0) revert InvalidAmount();
        claimableBacking[msg.sender] = 0;
        totalClaimableBacking -= amount;
        backing.safeTransfer(msg.sender, amount);
        emit BackingClaimed(msg.sender, amount);
    }

    function _position(uint256 id) private view returns (Position memory p) {
        p = positions[id];
        if (p.owner != msg.sender) revert NotOwner();
        if (block.timestamp < p.openedAt + terms.exitDelay) revert NotReady();
    }

    function _reduce(uint256 id, Position memory p, uint256 amount, uint256 floorOut) private {
        if (amount == p.amount) {
            delete positions[id];
            openIds.remove(id);
        } else {
            positions[id].amount = p.amount - amount;
            positions[id].floor = p.floor - floorOut;
        }
        reservedBacking -= floorOut;
        protectedBalance -= amount;
    }

    function _sendAsset(address recipient, uint256 amount) private {
        if (amount == 0) return;
        if (protectedToken != address(0)) {
            IERC20(protectedToken).safeTransfer(recipient, amount);
            return;
        }
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
