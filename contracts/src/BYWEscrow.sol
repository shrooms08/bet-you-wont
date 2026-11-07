// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Minimal interface for a token that lets a holder destroy its own balance.
interface IBurnable {
    function burn(uint256 value) external;
}

/// @title Bet You Won't (BYW) escrow
/// @notice Friends in a group dare each other. The dare's creator locks a token bounty. The doer accepts,
///         posts proof, and the rest of the group votes. The contract then pays the doer (pass) or refunds
///         the creator (fail), burning a share of the bounty. If the doer never posts proof, or nobody
///         votes, the creator gets everything back and nothing is burned.
/// @dev v2 (after the 2026-11-07 audit): the voter set is fixed when the dare is created (H-1), a vote
///      with no ballots refunds the creator (M-2), public groups have their own lower bounty cap, and
///      ownership can never be renounced (L-2).
/// @dev No function moves escrowed tokens except `cancelDare` and `settle`. There is no upgradeability,
///      no receive/fallback, and no EOA / tx.origin / extcodesize checks: user wallets are EIP-7702
///      smart accounts and have code. Joining a group needs an EIP-712 permit signed by `inviteSigner`.
contract BYWEscrow is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum DareState {
        None, // dare does not exist
        Open, // created, waiting for someone to accept
        Accepted, // a doer accepted, proof not yet submitted
        Voting, // proof submitted, group is voting
        Settled, // paid out (and burned, unless expired)
        Cancelled // creator cancelled before anyone accepted, fully refunded
    }

    enum Outcome {
        None, // not settled
        Passed, // group voted the dare done: doer 95%, 5% burned
        Failed, // group voted the dare not done: creator 90%, 10% burned
        Expired, // no proof before the deadline: creator 100%, nothing burned
        NoVotes // proof posted but nobody voted by voteEnd: creator 100%, nothing burned
    }

    struct Group {
        address creator;
        bool isPublic; // label for the frontend only; joining always needs a signed permit
        uint32 memberCount;
        uint64 createdAt;
    }

    struct Dare {
        // slot 0
        address creator;
        uint32 doDuration;
        uint32 voteWindow;
        DareState state;
        Outcome outcome;
        // slot 1
        address target;
        uint64 acceptedAt;
        // slot 2
        address doer;
        uint64 proofDeadline;
        // slot 3
        uint128 amount;
        uint64 proofAt;
        uint64 voteEnd;
        // slot 4
        uint64 groupId;
        uint32 voterSnapshot; // group's member count when the dare was created
        uint32 eligible; // voters: snapshot members minus creator and doer (set on accept)
        uint32 passVotes;
        uint32 failVotes;
        // slots 5-6
        bytes32 metaHash;
        bytes32 proofHash;
    }

    // ---------------------------------------------------------------------
    // Constants and immutables
    // ---------------------------------------------------------------------

    /// @notice EIP-712 typehash of the join permit the invite signer signs.
    bytes32 public constant JOIN_PERMIT_TYPEHASH =
        keccak256("JoinPermit(uint256 groupId,address account,uint256 deadline)");

    /// @notice Share of the bounty burned when the dare passes (5%).
    uint256 public constant PASS_BURN_BPS = 500;
    /// @notice Share of the bounty burned when the dare fails by vote (10%).
    uint256 public constant FAIL_BURN_BPS = 1000;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice The owner can never raise the max bounty above this.
    uint256 public constant HARD_CAP = 5_000_000e18;
    /// @notice Smallest bounty allowed.
    uint256 public constant MIN_BOUNTY = 1e18;
    uint32 public constant MIN_DO_DURATION = 1 hours;
    uint32 public constant MAX_DO_DURATION = 7 days;
    /// @notice A group needs this many members to create a dare: creator, doer, and at least one witness.
    uint32 public constant MIN_GROUP_SIZE = 3;

    /// @notice The bounty token ($wif).
    IERC20 public immutable token;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Backend address whose EIP-712 signatures let accounts join groups.
    address public inviteSigner;
    /// @notice Largest bounty currently allowed for a new dare.
    uint256 public maxBounty = 500_000e18;
    /// @notice Largest bounty currently allowed for a new dare in a public group (also capped by maxBounty).
    uint256 public publicMaxBounty = 20_000e18;
    /// @notice Number of groups created. Group ids run from 1 to groupCount.
    uint256 public groupCount;
    /// @notice Number of dares created. Dare ids run from 1 to dareCount.
    uint256 public dareCount;

    mapping(uint256 groupId => Group) private _groups;
    /// @dev 1-based join order of each member inside a group (0 = not a member). A member may vote on a
    ///      dare only if their join index is <= the dare's voterSnapshot.
    mapping(uint256 groupId => mapping(address account => uint32 joinIndex)) private _joinIndex;
    mapping(uint256 dareId => Dare) private _dares;
    mapping(uint256 dareId => mapping(address account => bool)) private _voted;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event GroupCreated(uint256 indexed groupId, address indexed creator, bool isPublic);
    event MemberJoined(uint256 indexed groupId, address indexed member, uint32 joinIndex);
    event InviteSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event DareCreated(
        uint256 indexed dareId,
        uint256 indexed groupId,
        address indexed creator,
        address target,
        uint256 amount,
        uint32 doDuration,
        uint32 voteWindow,
        bytes32 metaHash
    );
    event DareCancelled(uint256 indexed dareId);
    event DareAccepted(uint256 indexed dareId, address indexed doer, uint64 proofDeadline);
    event ProofSubmitted(uint256 indexed dareId, bytes32 proofHash, uint64 voteEnd, uint32 eligible);
    event Voted(uint256 indexed dareId, address indexed voter, bool pass);
    event DareSettled(
        uint256 indexed dareId, Outcome outcome, address indexed recipient, uint256 payout, uint256 burned
    );
    event MaxBountyUpdated(uint256 newMax);
    event PublicMaxBountyUpdated(uint256 newMax);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error GroupNotFound();
    error AlreadyMember();
    error NotMember();
    error PermitExpired();
    error InvalidPermitSigner();
    error GroupTooSmall();
    error InvalidTarget();
    error AmountOutOfRange();
    error InvalidDoDuration();
    error InvalidVoteWindow();
    error InvalidState();
    error NotDareCreator();
    error CreatorCannotAccept();
    error NotTarget();
    error NotDoer();
    error ProofDeadlinePassed();
    error VotingClosed();
    error AlreadyVoted();
    error DoerCannotVote();
    error CreatorCannotVote();
    error NotEligibleVoter();
    error NotResolvable();
    error InvalidMaxBounty();
    error PublicBountyTooHigh();
    error RenounceDisabled();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @notice Deploys the escrow for one bounty token. The deployer becomes the owner.
    /// @param token_ The bounty token. It must support `burn(uint256)` on the caller's own balance.
    /// @param inviteSigner_ Backend address that signs join permits.
    constructor(IERC20 token_, address inviteSigner_) Ownable(msg.sender) EIP712("BYWEscrow", "1") {
        if (address(token_) == address(0) || inviteSigner_ == address(0)) revert ZeroAddress();
        token = token_;
        inviteSigner = inviteSigner_;
        emit InviteSignerUpdated(address(0), inviteSigner_);
    }

    // ---------------------------------------------------------------------
    // Groups
    // ---------------------------------------------------------------------

    /// @notice Creates a new group. You become its first member.
    /// @param isPublic A label for the app (listed or not). It does not change who can join: joining
    ///        always needs a permit signed by the invite signer.
    /// @return groupId The new group's id (starts at 1).
    function createGroup(bool isPublic) external whenNotPaused returns (uint256 groupId) {
        groupId = ++groupCount;
        _groups[groupId] =
            Group({creator: msg.sender, isPublic: isPublic, memberCount: 1, createdAt: uint64(block.timestamp)});
        _joinIndex[groupId][msg.sender] = 1;

        emit GroupCreated(groupId, msg.sender, isPublic);
        emit MemberJoined(groupId, msg.sender, 1);
    }

    /// @notice Joins a group using a permit the BYW backend signed for you. Works while paused.
    /// @dev The permit names the joining account, so a permit copied from someone else's transaction is
    ///      useless to any other wallet. Membership is permanent, so a permit can only be used once.
    /// @param groupId The group to join.
    /// @param deadline Last timestamp at which the permit is valid.
    /// @param signature The invite signer's EIP-712 signature over JoinPermit(groupId, msg.sender, deadline).
    function joinGroup(uint256 groupId, uint256 deadline, bytes calldata signature) external {
        Group storage g = _groups[groupId];
        if (g.creator == address(0)) revert GroupNotFound();
        if (block.timestamp > deadline) revert PermitExpired();
        if (_joinIndex[groupId][msg.sender] != 0) revert AlreadyMember();
        if (ECDSA.recover(joinPermitDigest(groupId, msg.sender, deadline), signature) != inviteSigner) {
            revert InvalidPermitSigner();
        }

        uint32 joinIndex = ++g.memberCount;
        _joinIndex[groupId][msg.sender] = joinIndex;

        emit MemberJoined(groupId, msg.sender, joinIndex);
    }

    // ---------------------------------------------------------------------
    // Dares
    // ---------------------------------------------------------------------

    /// @notice Creates a dare and locks the bounty in escrow. You must have approved this contract first.
    /// @dev The group needs at least 3 members, so there is always someone besides the creator and the
    ///      doer to vote. The voter set is fixed here: only members who had joined by now can ever vote
    ///      on this dare, so wallets added later cannot swing it.
    /// @param groupId The group the dare belongs to. You must be a member.
    /// @param target The member being dared, or address(0) to let any other member accept.
    /// @param amount Bounty in token units (18 decimals). Between 1 token and `maxBounty`, and at most
    ///        `publicMaxBounty` in a public group.
    /// @param doDuration Seconds the doer has after accepting to post proof. Between 1 hour and 7 days.
    /// @param voteWindow Seconds the group has to vote after proof. One of 15 min, 1 h, 6 h or 24 h.
    /// @param metaHash keccak256 of the dare text stored off-chain.
    /// @return dareId The new dare's id (starts at 1).
    function createDare(
        uint256 groupId,
        address target,
        uint256 amount,
        uint32 doDuration,
        uint32 voteWindow,
        bytes32 metaHash
    ) external whenNotPaused nonReentrant returns (uint256 dareId) {
        if (!isMember(groupId, msg.sender)) revert NotMember();
        Group storage g = _groups[groupId];
        uint32 members = g.memberCount;
        if (members < MIN_GROUP_SIZE) revert GroupTooSmall();
        if (target != address(0) && (target == msg.sender || !isMember(groupId, target))) revert InvalidTarget();
        if (amount < MIN_BOUNTY || amount > maxBounty) revert AmountOutOfRange();
        if (g.isPublic && amount > publicMaxBounty) revert PublicBountyTooHigh();
        if (doDuration < MIN_DO_DURATION || doDuration > MAX_DO_DURATION) revert InvalidDoDuration();
        if (!_isValidVoteWindow(voteWindow)) revert InvalidVoteWindow();

        dareId = ++dareCount;
        Dare storage d = _dares[dareId];
        d.creator = msg.sender;
        d.doDuration = doDuration;
        d.voteWindow = voteWindow;
        d.state = DareState.Open;
        d.target = target;
        // casting to 'uint128' is safe because amount <= maxBounty <= HARD_CAP < 2^128
        // forge-lint: disable-next-line(unsafe-typecast)
        d.amount = uint128(amount);
        // casting to 'uint64' is safe because groupId is an existing group (caller is a member),
        // so groupId <= groupCount, which cannot realistically reach 2^64
        // forge-lint: disable-next-line(unsafe-typecast)
        d.groupId = uint64(groupId);
        d.voterSnapshot = members;
        d.metaHash = metaHash;

        emit DareCreated(dareId, groupId, msg.sender, target, amount, doDuration, voteWindow, metaHash);

        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Cancels your dare before anyone accepts it and refunds the full bounty. Nothing is burned.
    /// @param dareId The dare to cancel.
    function cancelDare(uint256 dareId) external nonReentrant {
        Dare storage d = _dares[dareId];
        if (msg.sender != d.creator) revert NotDareCreator();
        if (d.state != DareState.Open) revert InvalidState();

        d.state = DareState.Cancelled;
        emit DareCancelled(dareId);

        token.safeTransfer(d.creator, d.amount);
    }

    /// @notice Accepts a dare ("Aight bet"). Starts the clock for posting proof.
    /// @dev You must be a group member and not the dare's creator. If the dare has a target, only the
    ///      target can accept. Fixes the number of eligible voters: the snapshot members minus the creator,
    ///      and minus the doer if the doer is inside the snapshot.
    /// @param dareId The dare to accept.
    function acceptDare(uint256 dareId) external {
        Dare storage d = _dares[dareId];
        if (d.state != DareState.Open) revert InvalidState();
        if (!isMember(d.groupId, msg.sender)) revert NotMember();
        if (msg.sender == d.creator) revert CreatorCannotAccept();
        if (d.target != address(0) && msg.sender != d.target) revert NotTarget();

        // voterSnapshot >= MIN_GROUP_SIZE (3) and the creator is always inside it, so eligible >= 1.
        uint32 snapshot = d.voterSnapshot;
        uint32 eligible = snapshot - 1 - (_joinIndex[d.groupId][msg.sender] <= snapshot ? 1 : 0);

        uint64 deadline = uint64(block.timestamp) + d.doDuration;
        d.doer = msg.sender;
        d.eligible = eligible;
        d.acceptedAt = uint64(block.timestamp);
        d.proofDeadline = deadline;
        d.state = DareState.Accepted;

        emit DareAccepted(dareId, msg.sender, deadline);
    }

    /// @notice Posts proof that you did the dare and opens the group vote.
    /// @param dareId The dare you accepted.
    /// @param proofHash keccak256 (or content hash) of the proof stored off-chain.
    function submitProof(uint256 dareId, bytes32 proofHash) external {
        Dare storage d = _dares[dareId];
        if (d.state != DareState.Accepted) revert InvalidState();
        if (msg.sender != d.doer) revert NotDoer();
        if (block.timestamp > d.proofDeadline) revert ProofDeadlinePassed();

        uint64 voteEnd = uint64(block.timestamp) + d.voteWindow;
        d.proofHash = proofHash;
        d.proofAt = uint64(block.timestamp);
        d.voteEnd = voteEnd;
        d.state = DareState.Voting;

        emit ProofSubmitted(dareId, proofHash, voteEnd, d.eligible);
    }

    /// @notice Votes on whether the doer completed the dare.
    /// @dev Only members who had joined by the time the dare was created can vote (join index <=
    ///      voterSnapshot). The doer and the creator can never vote.
    /// @param dareId The dare being voted on.
    /// @param pass True if the dare was done, false if not.
    function vote(uint256 dareId, bool pass) external {
        Dare storage d = _dares[dareId];
        if (d.state != DareState.Voting) revert InvalidState();
        if (block.timestamp > d.voteEnd) revert VotingClosed();
        if (_voted[dareId][msg.sender]) revert AlreadyVoted();

        uint32 joinIndex = _joinIndex[d.groupId][msg.sender];
        if (joinIndex == 0) revert NotMember();
        // Exact even when someone joins in the same block as the dare was created.
        if (joinIndex > d.voterSnapshot) revert NotEligibleVoter();
        if (msg.sender == d.doer) revert DoerCannotVote();
        if (msg.sender == d.creator) revert CreatorCannotVote();

        _voted[dareId][msg.sender] = true;
        if (pass) {
            ++d.passVotes;
        } else {
            ++d.failVotes;
        }

        emit Voted(dareId, msg.sender, pass);
    }

    /// @notice Settles a dare once its result is known. Anyone can call this.
    /// @dev Expired (no proof by the deadline) or NoVotes (nobody voted by voteEnd): creator gets 100%,
    ///      nothing burned. Passed: doer gets 95%, 5% burned. Failed: creator gets 90%, 10% burned.
    ///      Burning calls token.burn, so total supply goes down.
    /// @param dareId The dare to settle.
    function settle(uint256 dareId) external nonReentrant {
        Dare storage d = _dares[dareId];
        (bool canSettle, Outcome outcome) = _resolve(d);
        if (!canSettle) revert NotResolvable();

        uint256 bps = outcome == Outcome.Passed ? PASS_BURN_BPS : outcome == Outcome.Failed ? FAIL_BURN_BPS : 0;
        uint256 amount = d.amount;
        uint256 burned = amount * bps / BPS_DENOMINATOR;
        uint256 payout = amount - burned;
        address recipient = outcome == Outcome.Passed ? d.doer : d.creator;

        d.state = DareState.Settled;
        d.outcome = outcome;
        emit DareSettled(dareId, outcome, recipient, payout, burned);

        token.safeTransfer(recipient, payout);
        if (burned != 0) IBurnable(address(token)).burn(burned);
    }

    // ---------------------------------------------------------------------
    // Owner
    // ---------------------------------------------------------------------

    /// @notice Replaces the backend address that signs join permits. Owner only.
    /// @dev Permits signed by the old signer stop working immediately, including unexpired ones.
    /// @param newSigner The new invite signer. Cannot be the zero address.
    function setInviteSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit InviteSignerUpdated(inviteSigner, newSigner);
        inviteSigner = newSigner;
    }

    /// @notice Sets the largest bounty allowed for new dares. Owner only. Never above HARD_CAP.
    /// @param newMax New maximum, between 1 token and HARD_CAP.
    function setMaxBounty(uint256 newMax) external onlyOwner {
        if (newMax < MIN_BOUNTY || newMax > HARD_CAP) revert InvalidMaxBounty();
        maxBounty = newMax;
        emit MaxBountyUpdated(newMax);
    }

    /// @notice Sets the largest bounty allowed for new dares in public groups. Owner only.
    /// @dev New dares in a public group must also stay within `maxBounty`. Existing dares are unaffected.
    /// @param newMax New public maximum, between 1 token and HARD_CAP.
    function setPublicMaxBounty(uint256 newMax) external onlyOwner {
        if (newMax < MIN_BOUNTY || newMax > HARD_CAP) revert InvalidMaxBounty();
        publicMaxBounty = newMax;
        emit PublicMaxBountyUpdated(newMax);
    }

    /// @notice Disabled: ownership can never be renounced, so the invite signer can always be rotated.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @notice Stops new groups and new dares. Owner only. Existing dares keep working, so funds
    ///         can always be cancelled or settled.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Allows new groups and new dares again. Owner only.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice The EIP-712 digest the invite signer must sign to let `account` join `groupId`.
    /// @dev Domain: name "BYWEscrow", version "1", this chain's id, this contract's address.
    function joinPermitDigest(uint256 groupId, address account, uint256 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(JOIN_PERMIT_TYPEHASH, groupId, account, deadline)));
    }

    /// @notice Whether an account is a member of a group.
    function isMember(uint256 groupId, address account) public view returns (bool) {
        return _joinIndex[groupId][account] != 0;
    }

    /// @notice An account's 1-based join order inside a group (0 if not a member). It can vote on a dare
    ///         only if this is <= the dare's voterSnapshot.
    function memberJoinIndex(uint256 groupId, address account) external view returns (uint32) {
        return _joinIndex[groupId][account];
    }

    /// @notice Returns a group's data. A zero creator means the group does not exist.
    function getGroup(uint256 groupId) external view returns (Group memory) {
        return _groups[groupId];
    }

    /// @notice Returns all of a dare's fields, including its state, outcome, voterSnapshot and eligible.
    ///         State None means it does not exist. eligible is 0 until the dare is accepted.
    function getDare(uint256 dareId) external view returns (Dare memory) {
        return _dares[dareId];
    }

    /// @notice Whether an account has already voted on a dare.
    function hasVoted(uint256 dareId, address account) external view returns (bool) {
        return _voted[dareId][account];
    }

    /// @notice Whether `settle` would succeed right now, and with which outcome.
    /// @return canSettle True if `settle(dareId)` would succeed now.
    /// @return outcome The outcome settle would produce, or None if it cannot settle yet.
    function resolvable(uint256 dareId) external view returns (bool canSettle, Outcome outcome) {
        return _resolve(_dares[dareId]);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Single source of truth for `settle` and `resolvable`.
    function _resolve(Dare storage d) internal view returns (bool canSettle, Outcome outcome) {
        if (d.state == DareState.Accepted) {
            if (block.timestamp > d.proofDeadline) return (true, Outcome.Expired);
        } else if (d.state == DareState.Voting) {
            return _outcomeOf(d);
        }
        return (false, Outcome.None);
    }

    /// @dev Outcome rules for a dare in Voting:
    ///      - pass is locked early when passVotes * 2 >= eligible
    ///      - fail is locked early when failVotes * 2 > eligible
    ///      - after voteEnd with zero votes: NoVotes (full refund, no burn)
    ///      - after voteEnd otherwise: pass if passVotes >= failVotes (ties pass)
    ///      Because the number of possible voters equals `eligible` (>= 1), the two early locks can never
    ///      both hold, neither holds with zero votes, and a lock can never be undone by later votes.
    function _outcomeOf(Dare storage d) internal view returns (bool decided, Outcome outcome) {
        uint256 eligible = d.eligible;
        uint256 passVotes = d.passVotes;
        uint256 failVotes = d.failVotes;
        if (passVotes * 2 >= eligible) return (true, Outcome.Passed);
        if (failVotes * 2 > eligible) return (true, Outcome.Failed);
        if (block.timestamp <= d.voteEnd) return (false, Outcome.None);
        if (passVotes + failVotes == 0) return (true, Outcome.NoVotes);
        return (true, passVotes >= failVotes ? Outcome.Passed : Outcome.Failed);
    }

    function _isValidVoteWindow(uint32 w) private pure returns (bool) {
        return w == 15 minutes || w == 1 hours || w == 6 hours || w == 24 hours;
    }
}
