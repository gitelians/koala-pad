// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title Token
 * @notice Fixed-supply ERC20 with burn capability, deployed as an
 *         EIP-1167 minimal proxy. The implementation contract is locked
 *         in its constructor; each clone is set up exactly once by the
 *         {LaunchpadFactory} via {initialize}.
 * @dev Holder ranking is intentionally NOT tracked on-chain. Top-holders
 *      are derived from Transfer events off-chain, which is both safer
 *      (no gas griefing through dust transfers) and cheaper.
 *
 *      OZ's ERC20 stores `_name` / `_symbol` in private slots set only by
 *      the constructor. Because clones never run a constructor, we shadow
 *      those storage slots with our own `_tokenName` / `_tokenSymbol` and
 *      override the public view getters. The implementation's ERC20
 *      constructor is therefore called with empty strings — its values
 *      are never read because the impl is locked from use.
 */
contract Token is ERC20, ERC20Burnable {
    uint256 public constant MAX_SUPPLY = 21_000_000 * 1e18;

    /// @notice True once {initialize} has run. Doubles as the clone-init
    ///         guard: the implementation sets this to `true` in its
    ///         constructor so it can never be initialised directly.
    bool public initialized;

    string private _tokenName;
    string private _tokenSymbol;

    event TokenInitialized(address pool, address ico, address vault, uint256 poolAmount);

    constructor() ERC20("", "") {
        // Lock the implementation so only clones can be initialised.
        initialized = true;
    }

    /**
     * @notice Set up this clone in a single call: record name/symbol and
     *         mint the 50/40/10 distribution to (ico, pool, vault).
     *
     *         Called exactly once by the factory immediately after the
     *         clone is created. The factory has no special permission
     *         beyond being first — the init guard makes this idempotent.
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        address pool,
        address ico,
        address vault
    ) external {
        require(!initialized, "Already initialized");
        initialized = true;

        _tokenName = name_;
        _tokenSymbol = symbol_;

        uint256 icoAmount = (MAX_SUPPLY * 50) / 100;
        uint256 vaultAmount = (MAX_SUPPLY * 10) / 100;
        uint256 poolAmount = MAX_SUPPLY - icoAmount - vaultAmount;

        _mint(ico, icoAmount);
        _mint(pool, poolAmount);
        _mint(vault, vaultAmount);

        emit TokenInitialized(pool, ico, vault, poolAmount);
    }

    function name() public view virtual override returns (string memory) {
        return _tokenName;
    }

    function symbol() public view virtual override returns (string memory) {
        return _tokenSymbol;
    }
}
