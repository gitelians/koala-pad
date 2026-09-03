// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./Token.sol";
import "./Pool.sol";
import "./ICO.sol";
import "./AirdropVault.sol";

/**
 * @title LaunchpadFactory
 * @notice Factory for creating tokens with an ICO phase and an integrated
 *         AMM. Children are deployed as EIP-1167 minimal proxies pointing
 *         at four immutable implementation contracts. This makes
 *         {createToken} ~10x cheaper than the previous `new`-based path
 *         and keeps the factory's own bytecode well under EIP-170.
 *
 *         The four implementations must be deployed first and their
 *         addresses passed to this constructor. Each implementation
 *         locks itself in its own constructor so it can never be
 *         initialised directly — only via clones.
 */
contract LaunchpadFactory is Ownable, ReentrancyGuard {
    address public immutable protocolTreasury;
    address public immutable wheelTreasury;

    /// @notice Implementation addresses used as clone templates.
    address public immutable tokenImpl;
    address public immutable poolImpl;
    address public immutable icoImpl;
    address public immutable vaultImpl;

    /// @notice Maximum length for token name/symbol (prevents bloat).
    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_SYMBOL_LENGTH = 16;

    struct TokenInfo {
        address token;
        address pool;
        address ico;
        address vault;
        address creator;
        uint256 createdAt;
    }

    TokenInfo[] public tokens;
    mapping(address => uint256[]) public tokenIndexesByCreator;

    event TokenCreated(
        address indexed token,
        address indexed pool,
        address ico,
        address vault,
        address creator,
        string name,
        string symbol
    );

    constructor(
        address _protocolTreasury,
        address _wheelTreasury,
        address _tokenImpl,
        address _poolImpl,
        address _icoImpl,
        address _vaultImpl
    ) Ownable(msg.sender) {
        require(_protocolTreasury != address(0), "Invalid protocol treasury");
        require(_wheelTreasury != address(0), "Invalid wheel treasury");
        require(_tokenImpl != address(0), "Invalid token impl");
        require(_poolImpl != address(0), "Invalid pool impl");
        require(_icoImpl != address(0), "Invalid ICO impl");
        require(_vaultImpl != address(0), "Invalid vault impl");
        protocolTreasury = _protocolTreasury;
        wheelTreasury = _wheelTreasury;
        tokenImpl = _tokenImpl;
        poolImpl = _poolImpl;
        icoImpl = _icoImpl;
        vaultImpl = _vaultImpl;
    }

    /**
     * @notice Create a new token with ICO phase.
     */
    function createToken(
        string memory name,
        string memory symbol
    ) external nonReentrant returns (
        address token,
        address pool,
        address ico,
        address vault
    ) {
        bytes memory nameBytes = bytes(name);
        bytes memory symbolBytes = bytes(symbol);
        require(nameBytes.length > 0 && nameBytes.length <= MAX_NAME_LENGTH, "Bad name length");
        require(symbolBytes.length > 0 && symbolBytes.length <= MAX_SYMBOL_LENGTH, "Bad symbol length");

        // Deploy minimal proxies. Each clone is ~55 bytes of init code +
        // ~45 bytes of runtime — orders of magnitude cheaper than `new`.
        token = Clones.clone(tokenImpl);
        pool  = Clones.clone(poolImpl);
        ico   = Clones.clone(icoImpl);
        vault = Clones.clone(vaultImpl);

        // Wire each child. msg.sender of the init() call is this factory,
        // which is how Pool.setICO() later authorises itself.
        Pool(payable(pool)).init(token, protocolTreasury, msg.sender);
        ICO(payable(ico)).init(token, pool, msg.sender, protocolTreasury);
        AirdropVault(vault).init(token, pool, ico, protocolTreasury);

        // Bind ICO to the pool so only it can seed initial liquidity.
        Pool(payable(pool)).setICO(ico);

        // Token is initialised last: it mints the 50/40/10 distribution
        // directly to the three receiving contracts in one shot.
        Token(token).initialize(name, symbol, pool, ico, vault);

        TokenInfo memory info = TokenInfo({
            token: token,
            pool: pool,
            ico: ico,
            vault: vault,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        tokenIndexesByCreator[msg.sender].push(tokens.length);
        tokens.push(info);

        emit TokenCreated(token, pool, ico, vault, msg.sender, name, symbol);
    }

    function getTokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function getCreatorTokenCount(address creator) external view returns (uint256) {
        return tokenIndexesByCreator[creator].length;
    }

    /**
     * @notice Paginated tokens-by-creator listing.
     */
    function getTokensByCreator(address creator, uint256 offset, uint256 limit)
        external
        view
        returns (TokenInfo[] memory result)
    {
        uint256[] storage idx = tokenIndexesByCreator[creator];
        uint256 total = idx.length;
        if (offset >= total) return new TokenInfo[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        uint256 size = end - offset;
        result = new TokenInfo[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = tokens[idx[offset + i]];
        }
    }

    function getTokens(uint256 offset, uint256 limit)
        external
        view
        returns (TokenInfo[] memory result)
    {
        uint256 total = tokens.length;
        if (offset >= total) return new TokenInfo[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        uint256 size = end - offset;
        result = new TokenInfo[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = tokens[offset + i];
        }
    }
}
