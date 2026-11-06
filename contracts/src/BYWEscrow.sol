// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal interface for a token that lets a holder destroy its own balance.
interface IBurnable {
    function burn(uint256 value) external;
}

/// @title Bet You Won't (BYW) escrow
/// @notice Friends in a group dare each other. The dare's creator locks a token bounty. The doer accepts,
///         posts proof, and the group votes. The contract then pays the doer (pass) or refunds the creator
///         (fail), and burns a share of the bounty either way.
/// @dev No function moves escrowed tokens except `cancelDare` and `settle`. There is no upgradeability,
///      no receive/fallback, and no EOA / tx.origin / extcodesize checks: user wallets are EIP-7702
///      smart accounts and have code.
contract BYWEscrow is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum DareState {
        None, // dare does not exist
        Open, // created, waiting for someone to accept
        Accepted, // a doer accepted, proof not yet submitted
        Voting, // proof submitted, group is voting
        Settled, // paid out and burned
        Cancelled // creator cancelled before anyone accepted, fully refunded
    }

    struct Group {
        address creator;
        bool isPublic;
        uint32 memberCount;
        uint64 createdAt;
        bytes32 inviteHash;
    }

    /// @dev `seq` is the member's 1-based join order inside the group. It gives an exact voter snapshot:
    ///      a member may vote on a dare only if `seq <= dare.membersAtProof`.
    struct Member {
        uint64 joinedAt;
        uint32 seq;
    }

    struct Dare {
        // slot 0
        address creator;
        uint32 doDuration;
        uint32 voteWindow;
        DareState state;
        bool passed;
        bool creatorVotes;
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
        uint32 membersAtProof;
        uint32 eligible;
        uint32 passVotes;
        uint32 failVotes;
        // slots 5-6
        bytes32 metaHash;
        bytes32 proofHash;
    }

    // ---------------------------------------------------------------------
    // Constants and immutables
    // ---------------------------------------------------------------------

    /// @notice Share of the bounty burned when the dare passes (5%).
    uint256 public constant PASS_BURN_BPS = 500;
    /// @notice Share of the bounty burned when the dare fails (10%).
    uint256 public constant FAIL_BURN_BPS = 1000;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice The owner can never raise the max bounty above this.
    uint256 public constant HARD_CAP = 5_000_000e18;
    /// @notice Smallest bounty allowed.
    uint256 public constant MIN_BOUNTY = 1e18;
    uint32 public constant MIN_DO_DURATION = 1 hours;
    uint32 public constant MAX_DO_DURATION = 7 days;

    /// @notice The bounty token ($wif).
    IERC20 public immutable token;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Largest bounty currently allowed for a new dare.
    uint256 public maxBounty = 500_000e18;
    /// @notice Number of groups created. Group ids run from 1 to groupCount.
    uint256 public groupCount;
    /// @notice Number of dares created. Dare ids run from 1 to dareCount.
    uint256 public dareCount;

    mapping(uint256 groupId => Group) private _groups;
    mapping(uint256 groupId => mapping(address account => Member)) private _members;
    mapping(uint256 dareId => Dare) private _dares;
    mapping(uint256 dareId => mapping(address account => bool)) private _voted;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event GroupCreated(uint256 indexed groupId, address indexed creator, bool isPublic);
    event MemberJoined(uint256 indexed groupId, address indexed member);
    event InviteHashUpdated(uint256 indexed groupId);
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
    event ProofSubmitted(uint256 indexed dareId, bytes32 proofHash, uint64 voteEnd, uint32 eligible, bool creatorVotes);
    event Voted(uint256 indexed dareId, address indexed voter, bool pass);
    event DareSettled(uint256 indexed dareId, bool passed, address indexed recipient, uint256 payout, uint256 burned);
    event MaxBountyUpdated(uint256 newMax);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error GroupNotFound();
    error AlreadyMember();
    error NotMember();
    error InvalidInviteCode();
    error NotGroupCreator();
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

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @notice Deploys the escrow for one bounty token. The deployer becomes the owner.
    /// @param token_ The bounty token. It must support `burn(uint256)` on the caller's own balance.
    constructor(IERC20 token_) Ownable(msg.sender) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
    }

    // ---------------------------------------------------------------------
    // Groups
    // ---------------------------------------------------------------------

    /// @notice Creates a new group. You become its first member.
    /// @param inviteHash keccak256 of the invite code people need to join. Ignored for public groups.
    /// @param isPublic If true, anyone can join without a code.
    /// @return groupId The new group's id (starts at 1).
    function createGroup(bytes32 inviteHash, bool isPublic) external whenNotPaused returns (uint256 groupId) {
        groupId = ++groupCount;
        _groups[groupId] = Group({
            creator: msg.sender,
            isPublic: isPublic,
            memberCount: 1,
            createdAt: uint64(block.timestamp),
            inviteHash: inviteHash
        });
        _members[groupId][msg.sender] = Member({joinedAt: uint64(block.timestamp), seq: 1});

        emit GroupCreated(groupId, msg.sender, isPublic);
        emit MemberJoined(groupId, msg.sender);
    }

    /// @notice Joins a group. Public groups need no code; private groups need the invite code.
    /// @dev The code is sent in plain text, so anyone reading the chain learns it once it is used.
    ///      Group creators should rotate it with `setInviteHash` if that matters.
    /// @param groupId The group to join.
    /// @param inviteCode The invite code in plain text. Ignored for public groups.
    function joinGroup(uint256 groupId, string calldata inviteCode) external {
        Group storage g = _groups[groupId];
        if (g.creator == address(0)) revert GroupNotFound();
        if (_members[groupId][msg.sender].seq != 0) revert AlreadyMember();
        if (!g.isPublic && keccak256(bytes(inviteCode)) != g.inviteHash) revert InvalidInviteCode();

        uint32 seq = ++g.memberCount;
        _members[groupId][msg.sender] = Member({joinedAt: uint64(block.timestamp), seq: seq});

        emit MemberJoined(groupId, msg.sender);
    }

    /// @notice Changes a group's invite code. Only the group's creator can do this.
    /// @param groupId The group to update.
    /// @param newHash keccak256 of the new invite code.
    function setInviteHash(uint256 groupId, bytes32 newHash) external {
        Group storage g = _groups[groupId];
        if (g.creator == address(0)) revert GroupNotFound();
        if (msg.sender != g.creator) revert NotGroupCreator();
        g.inviteHash = newHash;
        emit InviteHashUpdated(groupId);
    }

    // ---------------------------------------------------------------------
    // Dares
    // ---------------------------------------------------------------------

    /// @notice Creates a dare and locks the bounty in escrow. You must have approved this contract first.
    /// @param groupId The group the dare belongs to. You must be a member.
    /// @param target The member being dared, or address(0) to let any other member accept.
    /// @param amount Bounty in token units (18 decimals). Between 1 token and `maxBounty`.
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
        if (target != address(0) && (target == msg.sender || !isMember(groupId, target))) revert InvalidTarget();
        if (amount < MIN_BOUNTY || amount > maxBounty) revert AmountOutOfRange();
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
    ///      target can accept.
    /// @param dareId The dare to accept.
    function acceptDare(uint256 dareId) external {
        Dare storage d = _dares[dareId];
        if (d.state != DareState.Open) revert InvalidState();
        if (!isMember(d.groupId, msg.sender)) revert NotMember();
        if (msg.sender == d.creator) revert CreatorCannotAccept();
        if (d.target != address(0) && msg.sender != d.target) revert NotTarget();

        uint64 deadline = uint64(block.timestamp) + d.doDuration;
        d.doer = msg.sender;
        d.acceptedAt = uint64(block.timestamp);
        d.proofDeadline = deadline;
        d.state = DareState.Accepted;

        emit DareAccepted(dareId, msg.sender, deadline);
    }

    /// @notice Posts proof that you did the dare and opens the group vote.
    /// @dev Snapshots who may vote: members who had joined by this moment, minus the doer and the creator.
    ///      If nobody else is in the group, the creator becomes the only voter.
    /// @param dareId The dare you accepted.
    /// @param proofHash keccak256 (or content hash) of the proof stored off-chain.
    function submitProof(uint256 dareId, bytes32 proofHash) external {
        Dare storage d = _dares[dareId];
        if (d.state != DareState.Accepted) revert InvalidState();
        if (msg.sender != d.doer) revert NotDoer();
        if (block.timestamp > d.proofDeadline) revert ProofDeadlinePassed();

        // The creator and the doer are both members (members can never leave), so memberCount >= 2.
        uint32 members = _groups[d.groupId].memberCount;
        uint32 eligible = members - 2;
        bool creatorVotes = false;
        if (eligible == 0) {
            creatorVotes = true;
            eligible = 1;
        }

        uint64 voteEnd = uint64(block.timestamp) + d.voteWindow;
        d.proofHash = proofHash;
        d.proofAt = uint64(block.timestamp);
        d.voteEnd = voteEnd;
        d.membersAtProof = members;
        d.eligible = eligible;
        d.creatorVotes = creatorVotes;
        d.state = DareState.Voting;

        emit ProofSubmitted(dareId, proofHash, voteEnd, eligible, creatorVotes);
    }

    /// @notice Votes on whether the doer completed the dare.
    /// @dev Only members who had joined by the time proof was posted can vote. The doer can never vote.
    ///      The creator can vote only when they are the sole eligible voter.
    /// @param dareId The dare being voted on.
    /// @param pass True if the dare was done, false if not.
    function vote(uint256 dareId, bool pass) external {
        Dare storage d = _dares[dareId];
        if (d.state != DareState.Voting) revert InvalidState();
        if (block.timestamp > d.voteEnd) revert VotingClosed();
        if (_voted[dareId][msg.sender]) revert AlreadyVoted();

        Member memory m = _members[d.groupId][msg.sender];
        if (m.seq == 0) revert NotMember();
        // `seq` is exact even when someone joins in the same block as the proof. The joinedAt check
        // mirrors the spec's wording and is implied by the seq check.
        if (m.seq > d.membersAtProof || m.joinedAt > d.proofAt) revert NotEligibleVoter();
        if (msg.sender == d.doer) revert DoerCannotVote();
        if (msg.sender == d.creator && !d.creatorVotes) revert CreatorCannotVote();

        _voted[dareId][msg.sender] = true;
        if (pass) {
            ++d.passVotes;
        } else {
            ++d.failVotes;
        }

        emit Voted(dareId, msg.sender, pass);
    }

    /// @notice Settles a dare once its result is known. Anyone can call this.
    /// @dev Settles when (a) the doer missed the proof deadline (fail), or (b) voting is over or the
    ///      result is already locked by votes. Pass: doer gets 95%, 5% is burned. Fail: creator gets
    ///      90%, 10% is burned. Burning calls token.burn, so total supply goes down.
    /// @param dareId The dare to settle.
    function settle(uint256 dareId) external nonReentrant {
        Dare storage d = _dares[dareId];

        bool passed;
        if (d.state == DareState.Accepted) {
            if (block.timestamp <= d.proofDeadline) revert NotResolvable();
            passed = false;
        } else if (d.state == DareState.Voting) {
            bool decided;
            (decided, passed) = _outcomeOf(d);
            if (!decided) revert NotResolvable();
        } else {
            revert NotResolvable();
        }

        uint256 amount = d.amount;
        uint256 burned = amount * (passed ? PASS_BURN_BPS : FAIL_BURN_BPS) / BPS_DENOMINATOR;
        uint256 payout = amount - burned;
        address recipient = passed ? d.doer : d.creator;

        d.state = DareState.Settled;
        d.passed = passed;
        emit DareSettled(dareId, passed, recipient, payout, burned);

        token.safeTransfer(recipient, payout);
        IBurnable(address(token)).burn(burned);
    }

    // ---------------------------------------------------------------------
    // Owner
    // ---------------------------------------------------------------------

    /// @notice Sets the largest bounty allowed for new dares. Owner only. Never above HARD_CAP.
    /// @param newMax New maximum, between 1 token and HARD_CAP.
    function setMaxBounty(uint256 newMax) external onlyOwner {
        if (newMax < MIN_BOUNTY || newMax > HARD_CAP) revert InvalidMaxBounty();
        maxBounty = newMax;
        emit MaxBountyUpdated(newMax);
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

    /// @notice Whether an account is a member of a group.
    function isMember(uint256 groupId, address account) public view returns (bool) {
        return _members[groupId][account].seq != 0;
    }

    /// @notice When an account joined a group (0 if not a member).
    function joinedAt(uint256 groupId, address account) external view returns (uint64) {
        return _members[groupId][account].joinedAt;
    }

    /// @notice Returns a group's data. A zero creator means the group does not exist.
    function getGroup(uint256 groupId) external view returns (Group memory) {
        return _groups[groupId];
    }

    /// @notice Returns all of a dare's fields, including its current state. State None means it does not exist.
    function getDare(uint256 dareId) external view returns (Dare memory) {
        return _dares[dareId];
    }

    /// @notice Whether an account has already voted on a dare.
    function hasVoted(uint256 dareId, address account) external view returns (bool) {
        return _voted[dareId][account];
    }

    /// @notice Whether `settle` would succeed right now, and which way it would go.
    /// @return canSettle True if `settle(dareId)` would succeed now.
    /// @return wouldPass If canSettle, the result settle would produce. If voting is still open and
    ///         undecided, the result if the vote ended with the current tally. False otherwise.
    function resolvable(uint256 dareId) external view returns (bool canSettle, bool wouldPass) {
        Dare storage d = _dares[dareId];
        if (d.state == DareState.Accepted) {
            return (block.timestamp > d.proofDeadline, false);
        }
        if (d.state == DareState.Voting) {
            return _outcomeOf(d);
        }
        return (false, false);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Outcome rules for a dare in Voting:
    ///      - pass is locked early when passVotes * 2 >= eligible
    ///      - fail is locked early when failVotes * 2 > eligible
    ///      - after voteEnd: pass if passVotes >= failVotes (ties and zero votes pass)
    ///      Because the number of possible voters equals `eligible`, the two early locks can never both hold,
    ///      and a lock can never be undone by later votes.
    /// @return decided True if the result is final (locked or voting over).
    /// @return pass The final result if decided, otherwise the current leaning.
    function _outcomeOf(Dare storage d) internal view returns (bool decided, bool pass) {
        uint256 eligible = d.eligible;
        uint256 passVotes = d.passVotes;
        uint256 failVotes = d.failVotes;
        if (passVotes * 2 >= eligible) return (true, true);
        if (failVotes * 2 > eligible) return (true, false);
        return (block.timestamp > d.voteEnd, passVotes >= failVotes);
    }

    function _isValidVoteWindow(uint32 w) private pure returns (bool) {
        return w == 15 minutes || w == 1 hours || w == 6 hours || w == 24 hours;
    }
}
