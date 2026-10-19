// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Subset of Flare's FlareContractRegistry (same address on every Flare network:
/// 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019).
interface IFlareContractRegistry {
    function getContractAddressByName(string calldata name) external view returns (address);
}

/// @notice View-typed subset of FtsoV2Interface, matching Flare's TestFtsoV2Interface.
/// @dev FtsoV2Interface declares the reads `payable` because a FeeCalculator fee "may need to be
/// paid". Calling them through this view interface is a zero-value STATICCALL to the same FtsoV2
/// contract, which is what `ContractRegistry.getTestFtsoV2()` does. The adapter checks the fee is
/// zero first, so a future fee makes prices fail closed instead of silently misbehaving.
interface IFtsoV2FeedReader {
    function getFeedById(bytes21 feedId) external view returns (uint256 value, int8 decimals, uint64 timestamp);
    function calculateFeeById(bytes21 feedId) external view returns (uint256 fee);
}

/// @notice Read-only FTSOv2 block-latency feed adapter for YieldShield pools on Coston2.
/// Returns the feed value in 6-decimal backing units per whole protected asset (1e18 base units),
/// the unit `ShieldPool` expects. There is no fallback from an invalid or stale feed to any other
/// price: such reads revert, which blocks protection and asset exits but never backing exits.
contract ShieldFtsoV2Oracle {
    /// @notice Decimals of `price()`: the pools' 6-decimal backing units.
    uint8 public constant PRICE_DECIMALS = 6;
    /// @notice Largest accepted absolute feed decimal count; FTSOv2 feeds use small positive values.
    int8 public constant MAX_FEED_DECIMALS = 18;
    IFlareContractRegistry public immutable registry;
    bytes21 public immutable feedId;
    /// @notice Largest accepted age of the feed timestamp, in seconds.
    uint256 public immutable maxAge;

    constructor(IFlareContractRegistry registry_, bytes21 feedId_, uint256 maxAge_) {
        require(block.chainid == 114 || block.chainid == 31337, "TESTNET_ONLY");
        require(address(registry_).code.length > 0, "REGISTRY");
        require(feedId_ != bytes21(0), "FEED_ID");
        require(maxAge_ > 0 && maxAge_ <= 1 hours, "MAX_AGE");
        registry = registry_;
        feedId = feedId_;
        maxAge = maxAge_;
        // Fails deployment if FtsoV2 cannot be resolved or does not know this feed id.
        latest();
    }

    /// @notice The current FtsoV2 contract, resolved through the registry on every read as Flare recommends.
    function ftsoV2() public view returns (address ftso) {
        ftso = registry.getContractAddressByName("FtsoV2");
        require(ftso.code.length > 0, "NO_FTSO_V2");
    }

    /// @notice The raw feed reading without validation, for monitoring and the interface.
    function latest() public view returns (uint256 value, int8 decimals, uint64 timestamp) {
        IFtsoV2FeedReader ftso = IFtsoV2FeedReader(ftsoV2());
        require(ftso.calculateFeeById(feedId) == 0, "FEE_REQUIRED");
        return ftso.getFeedById(feedId);
    }

    /// @notice Validated price in 6-decimal backing units per 1e18 protected-asset base units.
    function price() external view returns (uint256 result) {
        (uint256 value, int8 decimals, uint64 timestamp) = latest();
        require(value > 0, "ZERO_PRICE");
        require(timestamp > 0 && timestamp <= block.timestamp, "INVALID_TIMESTAMP");
        require(block.timestamp - timestamp <= maxAge, "STALE_PRICE");
        require(decimals >= -MAX_FEED_DECIMALS && decimals <= MAX_FEED_DECIMALS, "FEED_DECIMALS");
        // |shift| <= 24 after the bound above, so both casts are exact. A product that overflows
        // reverts (checked arithmetic) rather than returning a wrong price.
        int256 shift = int256(uint256(PRICE_DECIMALS)) - decimals;
        // forge-lint: disable-next-line(unsafe-typecast)
        result = shift >= 0 ? value * 10 ** uint256(shift) : value / 10 ** uint256(-shift);
        require(result > 0, "ZERO_PRICE");
    }
}
