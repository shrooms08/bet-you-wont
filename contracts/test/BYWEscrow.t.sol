// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {BYWEscrow} from "../src/BYWEscrow.sol";
import {MockWIF} from "../src/mocks/MockWIF.sol";

/// @dev A minimal smart-contract wallet that forwards calls from its owner. Stands in for a
///      Privy / EIP-7702 account, which has code at the user's address.
contract SimpleWallet {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function execute(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner, "not owner");
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }
}

/// @dev Builds EIP-712 join permits independently of the contract (does not call joinPermitDigest).
abstract contract PermitSigner is Test {
    /// @dev TEST-ONLY keys. Never use outside tests.
    uint256 internal constant SIGNER_PK = 0x5161e57e570001;
    uint256 internal constant OTHER_PK = 0xbad5161e57e570002;

    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("JoinPermit(uint256 groupId,address account,uint256 deadline)");

    function _permitDigest(address escrow_, uint256 groupId, address account, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 domainSeparator =
            keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("BYWEscrow"), keccak256("1"), block.chainid, escrow_));
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, groupId, account, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _signPermit(uint256 pk, address escrow_, uint256 groupId, address account, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _permitDigest(escrow_, groupId, account, deadline));
        return abi.encodePacked(r, s, v);
    }
}

abstract contract BYWBase is PermitSigner {
    BYWEscrow internal escrow;
    MockWIF internal wif;

    address internal signer = vm.addr(SIGNER_PK);
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice"); // dare creator in most tests
    address internal bob = makeAddr("bob"); // doer in most tests
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal erin = makeAddr("erin");
    address internal frank = makeAddr("frank");
    address internal outsider = makeAddr("outsider");

    uint256 internal constant AMT = 1_000e18;
    uint32 internal constant DO = 1 days;
    uint32 internal constant WIN = 1 hours;
    bytes32 internal constant META = keccak256("eat a whole lemon");
    bytes32 internal constant PROOF = keccak256("ipfs://lemon-video");

    function setUp() public virtual {
        wif = new MockWIF(address(this), 1_000_000_000e18);
        vm.prank(owner);
        escrow = new BYWEscrow(IERC20(address(wif)), signer);

        address[7] memory users = [alice, bob, carol, dave, erin, frank, outsider];
        for (uint256 i; i < users.length; ++i) {
            wif.transfer(users[i], 10_000_000e18);
            vm.prank(users[i]);
            wif.approve(address(escrow), type(uint256).max);
        }
    }

    function _sig(uint256 gid, address who, uint256 deadline) internal view returns (bytes memory) {
        return _signPermit(SIGNER_PK, address(escrow), gid, who, deadline);
    }

    function _join(uint256 gid, address who) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sig(gid, who, deadline);
        vm.prank(who);
        escrow.joinGroup(gid, deadline, sig);
    }

    /// @dev Group created by alice, then bob, carol, dave, erin, frank join in that order.
    function _group(uint256 size) internal returns (uint256 gid) {
        vm.prank(alice);
        gid = escrow.createGroup(false);
        address[5] memory others = [bob, carol, dave, erin, frank];
        for (uint256 i; i + 1 < size; ++i) {
            _join(gid, others[i]);
        }
    }

    function _dare(uint256 gid, address target, uint256 amount) internal returns (uint256 id) {
        vm.prank(alice);
        id = escrow.createDare(gid, target, amount, DO, WIN, META);
    }

    /// @dev Group of `size` (>= 3), alice dares (open), bob accepts and posts proof.
    function _voting(uint256 size, uint256 amount) internal returns (uint256 gid, uint256 id) {
        gid = _group(size);
        id = _dare(gid, address(0), amount);
        vm.prank(bob);
        escrow.acceptDare(id);
        vm.prank(bob);
        escrow.submitProof(id, PROOF);
    }

    function _vote(uint256 id, address who, bool pass) internal {
        vm.prank(who);
        escrow.vote(id, pass);
    }

    function _settle(uint256 id) internal {
        vm.prank(outsider);
        escrow.settle(id);
    }

    function _outcome(uint256 id) internal view returns (BYWEscrow.Outcome) {
        return escrow.getDare(id).outcome;
    }

    function _assertResolvable(uint256 id, bool can, BYWEscrow.Outcome outcome) internal view {
        (bool c, BYWEscrow.Outcome o) = escrow.resolvable(id);
        assertEq(c, can, "canSettle");
        assertEq(uint8(o), uint8(outcome), "outcome");
    }
}

contract BYWEscrowTest is BYWBase {
    // ------------------------------------------------------------------
    // Deployment / config
    // ------------------------------------------------------------------

    function test_constructor() public view {
        assertEq(address(escrow.token()), address(wif));
        assertEq(escrow.owner(), owner);
        assertEq(escrow.inviteSigner(), signer);
        assertEq(escrow.maxBounty(), 500_000e18);
        assertEq(escrow.PASS_BURN_BPS(), 500);
        assertEq(escrow.FAIL_BURN_BPS(), 1000);
        assertEq(escrow.HARD_CAP(), 5_000_000e18);
        assertEq(escrow.MIN_GROUP_SIZE(), 3);
        assertEq(escrow.JOIN_PERMIT_TYPEHASH(), PERMIT_TYPEHASH);

        (, string memory name, string memory version, uint256 chainId, address verifying,,) = escrow.eip712Domain();
        assertEq(name, "BYWEscrow");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifying, address(escrow));
    }

    function test_constructor_emitsInitialSigner() public {
        vm.expectEmit(true, true, false, false);
        emit BYWEscrow.InviteSignerUpdated(address(0), signer);
        new BYWEscrow(IERC20(address(wif)), signer);
    }

    function test_constructor_zeroToken_reverts() public {
        vm.expectRevert(BYWEscrow.ZeroAddress.selector);
        new BYWEscrow(IERC20(address(0)), signer);
    }

    function test_constructor_zeroSigner_reverts() public {
        vm.expectRevert(BYWEscrow.ZeroAddress.selector);
        new BYWEscrow(IERC20(address(wif)), address(0));
    }

    // ------------------------------------------------------------------
    // Groups
    // ------------------------------------------------------------------

    function test_createGroup() public {
        vm.expectEmit(true, true, false, true);
        emit BYWEscrow.GroupCreated(1, alice, false);
        vm.expectEmit(true, true, false, false);
        emit BYWEscrow.MemberJoined(1, alice);
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);

        assertEq(gid, 1);
        assertEq(escrow.groupCount(), 1);
        BYWEscrow.Group memory g = escrow.getGroup(gid);
        assertEq(g.creator, alice);
        assertFalse(g.isPublic);
        assertEq(g.memberCount, 1);
        assertEq(g.createdAt, block.timestamp);
        assertTrue(escrow.isMember(gid, alice));
        assertEq(escrow.joinedAt(gid, alice), block.timestamp);

        vm.prank(bob);
        assertEq(escrow.createGroup(true), 2);
        assertTrue(escrow.getGroup(2).isPublic);
    }

    // ------------------------------------------------------------------
    // Join permits
    // ------------------------------------------------------------------

    function test_join_validPermit() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        vm.warp(block.timestamp + 100);

        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sig(gid, bob, deadline);
        vm.expectEmit(true, true, false, false);
        emit BYWEscrow.MemberJoined(gid, bob);
        vm.prank(bob);
        escrow.joinGroup(gid, deadline, sig);

        assertTrue(escrow.isMember(gid, bob));
        assertEq(escrow.joinedAt(gid, bob), block.timestamp);
        assertEq(escrow.getGroup(gid).memberCount, 2);
    }

    function test_join_atExactDeadline_ok() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _sig(gid, bob, deadline);
        vm.warp(deadline);
        vm.prank(bob);
        escrow.joinGroup(gid, deadline, sig);
        assertTrue(escrow.isMember(gid, bob));
    }

    function test_join_expiredDeadline_reverts() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _sig(gid, bob, deadline);

        vm.warp(deadline + 1);
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.PermitExpired.selector);
        escrow.joinGroup(gid, deadline, sig);
        assertFalse(escrow.isMember(gid, bob));
    }

    function test_join_nonSignerSignature_reverts() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signPermit(OTHER_PK, address(escrow), gid, bob, deadline);

        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidPermitSigner.selector);
        escrow.joinGroup(gid, deadline, sig);
    }

    function test_join_permitForA_submittedByB_reverts() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory bobSig = _sig(gid, bob, deadline);

        // carol copies bob's permit out of calldata
        vm.prank(carol);
        vm.expectRevert(BYWEscrow.InvalidPermitSigner.selector);
        escrow.joinGroup(gid, deadline, bobSig);
        assertFalse(escrow.isMember(gid, carol));

        // bob can still use it
        vm.prank(bob);
        escrow.joinGroup(gid, deadline, bobSig);
        assertTrue(escrow.isMember(gid, bob));
    }

    function test_join_reusePermit_reverts_alreadyMember() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sig(gid, bob, deadline);

        vm.prank(bob);
        escrow.joinGroup(gid, deadline, sig);
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.AlreadyMember.selector);
        escrow.joinGroup(gid, deadline, sig);
        assertEq(escrow.getGroup(gid).memberCount, 2);
    }

    function test_join_creatorAlreadyMember_reverts() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sig(gid, alice, deadline);
        vm.prank(alice);
        vm.expectRevert(BYWEscrow.AlreadyMember.selector);
        escrow.joinGroup(gid, deadline, sig);
    }

    function test_join_permitForOtherGroup_reverts() public {
        vm.prank(alice);
        uint256 g1 = escrow.createGroup(false);
        vm.prank(alice);
        uint256 g2 = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sigG1 = _sig(g1, bob, deadline);

        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidPermitSigner.selector);
        escrow.joinGroup(g2, deadline, sigG1);
    }

    function test_join_alteredDeadline_reverts() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sig(gid, bob, deadline);

        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidPermitSigner.selector);
        escrow.joinGroup(gid, deadline + 365 days, sig);
    }

    function test_join_permitForOtherEscrow_reverts() public {
        // same signer, same chain, different contract: the domain's verifyingContract differs
        BYWEscrow other = new BYWEscrow(IERC20(address(wif)), signer);
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        vm.prank(alice);
        other.createGroup(false);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sigForOther = _signPermit(SIGNER_PK, address(other), gid, bob, deadline);

        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidPermitSigner.selector);
        escrow.joinGroup(gid, deadline, sigForOther);
    }

    function test_join_publicLabelStillNeedsPermit() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(true);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory bad = _signPermit(OTHER_PK, address(escrow), gid, bob, deadline);
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidPermitSigner.selector);
        escrow.joinGroup(gid, deadline, bad);

        _join(gid, bob);
        assertTrue(escrow.isMember(gid, bob));
    }

    function test_join_malformedSignature_reverts() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureLength.selector, 10));
        escrow.joinGroup(gid, deadline, new bytes(10));

        vm.prank(bob);
        vm.expectRevert(ECDSA.ECDSAInvalidSignature.selector);
        escrow.joinGroup(gid, deadline, new bytes(65)); // all zeros recovers to address(0)
    }

    function test_join_nonexistentGroup_reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sig(42, bob, deadline);
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.GroupNotFound.selector);
        escrow.joinGroup(42, deadline, sig);
    }

    function test_join_whilePaused_works() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        vm.prank(owner);
        escrow.pause();
        _join(gid, bob);
        assertTrue(escrow.isMember(gid, bob));
    }

    function test_joinPermitDigest_matchesHelper() public view {
        uint256 deadline = block.timestamp + 1 hours;
        assertEq(escrow.joinPermitDigest(7, bob, deadline), _permitDigest(address(escrow), 7, bob, deadline));
    }

    function test_setInviteSigner_rotation() public {
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 1 days;
        bytes memory oldSig = _sig(gid, bob, deadline); // signed before rotation, still unexpired
        address newSigner = vm.addr(OTHER_PK);

        vm.expectEmit(true, true, false, false);
        emit BYWEscrow.InviteSignerUpdated(signer, newSigner);
        vm.prank(owner);
        escrow.setInviteSigner(newSigner);
        assertEq(escrow.inviteSigner(), newSigner);

        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidPermitSigner.selector);
        escrow.joinGroup(gid, deadline, oldSig);

        bytes memory newSig = _signPermit(OTHER_PK, address(escrow), gid, bob, deadline);
        vm.prank(bob);
        escrow.joinGroup(gid, deadline, newSig);
        assertTrue(escrow.isMember(gid, bob));
    }

    function test_setInviteSigner_onlyOwner_rejectsZero() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.setInviteSigner(alice);

        vm.prank(signer); // the signer itself has no owner powers
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, signer));
        escrow.setInviteSigner(alice);

        vm.prank(owner);
        vm.expectRevert(BYWEscrow.ZeroAddress.selector);
        escrow.setInviteSigner(address(0));
        assertEq(escrow.inviteSigner(), signer);
    }

    // ------------------------------------------------------------------
    // Witness rule
    // ------------------------------------------------------------------

    function test_createDare_groupTooSmall_reverts() public {
        uint256 gid = _group(1);
        vm.prank(alice);
        vm.expectRevert(BYWEscrow.GroupTooSmall.selector);
        escrow.createDare(gid, address(0), AMT, DO, WIN, META);

        _join(gid, bob); // 2 members
        vm.prank(alice);
        vm.expectRevert(BYWEscrow.GroupTooSmall.selector);
        escrow.createDare(gid, bob, AMT, DO, WIN, META);

        _join(gid, carol); // 3 members
        vm.prank(alice);
        uint256 id = escrow.createDare(gid, bob, AMT, DO, WIN, META);
        assertEq(id, 1);
        assertEq(wif.balanceOf(address(escrow)), AMT);
    }

    function test_minGroup_eligibleIsOne() public {
        (, uint256 id) = _voting(3, AMT);
        assertEq(escrow.getDare(id).eligible, 1);
        assertEq(escrow.getDare(id).membersAtProof, 3);
    }

    // ------------------------------------------------------------------
    // Happy path PASS
    // ------------------------------------------------------------------

    function test_passPath_fullFlow() public {
        uint256 gid = _group(3); // alice, bob, carol -> eligible = 1 (carol)
        uint256 supply0 = wif.totalSupply();
        uint256 bob0 = wif.balanceOf(bob);
        uint256 alice0 = wif.balanceOf(alice);

        vm.expectEmit(true, true, true, true);
        emit BYWEscrow.DareCreated(1, gid, alice, address(0), AMT, DO, WIN, META);
        uint256 id = _dare(gid, address(0), AMT);
        assertEq(id, 1);
        assertEq(wif.balanceOf(address(escrow)), AMT);
        assertEq(wif.balanceOf(alice), alice0 - AMT);

        BYWEscrow.Dare memory d = escrow.getDare(id);
        assertEq(uint8(d.state), uint8(BYWEscrow.DareState.Open));
        assertEq(uint8(d.outcome), uint8(BYWEscrow.Outcome.None));
        assertEq(d.creator, alice);
        assertEq(d.amount, AMT);
        assertEq(d.groupId, gid);
        assertEq(d.metaHash, META);
        _assertResolvable(id, false, BYWEscrow.Outcome.None);

        vm.expectEmit(true, true, false, true);
        emit BYWEscrow.DareAccepted(id, bob, uint64(block.timestamp + DO));
        vm.prank(bob);
        escrow.acceptDare(id);

        d = escrow.getDare(id);
        assertEq(uint8(d.state), uint8(BYWEscrow.DareState.Accepted));
        assertEq(d.doer, bob);
        assertEq(d.acceptedAt, block.timestamp);
        assertEq(d.proofDeadline, block.timestamp + DO);
        _assertResolvable(id, false, BYWEscrow.Outcome.None);

        vm.warp(block.timestamp + 3 hours);
        vm.expectEmit(true, false, false, true);
        emit BYWEscrow.ProofSubmitted(id, PROOF, uint64(block.timestamp + WIN), 1);
        vm.prank(bob);
        escrow.submitProof(id, PROOF);

        d = escrow.getDare(id);
        assertEq(uint8(d.state), uint8(BYWEscrow.DareState.Voting));
        assertEq(d.proofHash, PROOF);
        assertEq(d.proofAt, block.timestamp);
        assertEq(d.voteEnd, block.timestamp + WIN);
        assertEq(d.eligible, 1);
        _assertResolvable(id, false, BYWEscrow.Outcome.None);

        vm.expectEmit(true, true, false, true);
        emit BYWEscrow.Voted(id, carol, true);
        _vote(id, carol, true);
        assertTrue(escrow.hasVoted(id, carol));
        assertFalse(escrow.hasVoted(id, dave));
        _assertResolvable(id, true, BYWEscrow.Outcome.Passed);

        uint256 burn = AMT * 500 / 10_000;
        vm.expectEmit(true, true, false, true);
        emit BYWEscrow.DareSettled(id, BYWEscrow.Outcome.Passed, bob, AMT - burn, burn);
        _settle(id);

        assertEq(wif.balanceOf(bob), bob0 + AMT * 95 / 100, "doer gets exactly 95%");
        assertEq(wif.totalSupply(), supply0 - AMT * 5 / 100, "supply drops by exactly 5%");
        assertEq(wif.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(wif.balanceOf(alice), alice0 - AMT);

        d = escrow.getDare(id);
        assertEq(uint8(d.state), uint8(BYWEscrow.DareState.Settled));
        assertEq(uint8(d.outcome), uint8(BYWEscrow.Outcome.Passed));
        assertEq(d.passVotes, 1);
        _assertResolvable(id, false, BYWEscrow.Outcome.None);
    }

    // ------------------------------------------------------------------
    // FAIL by vote
    // ------------------------------------------------------------------

    function test_failPath_byVote() public {
        (, uint256 id) = _voting(3, AMT);
        uint256 supply0 = wif.totalSupply();
        uint256 alice0 = wif.balanceOf(alice);
        uint256 bob0 = wif.balanceOf(bob);

        _vote(id, carol, false); // 1*2 > 1 -> fail locked
        _assertResolvable(id, true, BYWEscrow.Outcome.Failed);

        vm.expectEmit(true, true, false, true);
        emit BYWEscrow.DareSettled(id, BYWEscrow.Outcome.Failed, alice, AMT * 90 / 100, AMT / 10);
        _settle(id);

        assertEq(wif.balanceOf(alice), alice0 + AMT * 90 / 100, "creator gets 90%");
        assertEq(wif.totalSupply(), supply0 - AMT / 10, "10% burned");
        assertEq(wif.balanceOf(bob), bob0);
        assertEq(wif.balanceOf(address(escrow)), 0);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Failed));
    }

    // ------------------------------------------------------------------
    // EXPIRED: no proof, full refund, no burn
    // ------------------------------------------------------------------

    function test_expired_noProof_fullRefundNoBurn() public {
        uint256 gid = _group(3);
        uint256 alice0 = wif.balanceOf(alice);
        uint256 id = _dare(gid, address(0), AMT);
        vm.prank(bob);
        escrow.acceptDare(id);
        uint256 supply0 = wif.totalSupply();
        uint256 bob0 = wif.balanceOf(bob);

        // exactly at the deadline: not yet settleable
        vm.warp(block.timestamp + DO);
        _assertResolvable(id, false, BYWEscrow.Outcome.None);
        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);

        vm.warp(block.timestamp + 1);
        _assertResolvable(id, true, BYWEscrow.Outcome.Expired);

        // proof is no longer accepted
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.ProofDeadlinePassed.selector);
        escrow.submitProof(id, PROOF);

        vm.expectEmit(true, true, false, true);
        emit BYWEscrow.DareSettled(id, BYWEscrow.Outcome.Expired, alice, AMT, 0);
        _settle(id); // a total outsider can settle

        assertEq(wif.balanceOf(alice), alice0, "creator gets exactly 100% back");
        assertEq(wif.totalSupply(), supply0, "nothing burned");
        assertEq(wif.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(wif.balanceOf(bob), bob0);
        assertEq(uint8(escrow.getDare(id).state), uint8(BYWEscrow.DareState.Settled));
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Expired));
    }

    // ------------------------------------------------------------------
    // Early locks, eligible = 4 (group of 6)
    // ------------------------------------------------------------------

    function test_earlyLock_pass_eligible4() public {
        (, uint256 id) = _voting(6, AMT);
        assertEq(escrow.getDare(id).eligible, 4);
        uint256 bob0 = wif.balanceOf(bob);

        _vote(id, carol, true);
        _assertResolvable(id, false, BYWEscrow.Outcome.None); // 1 of 4 is not a lock
        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);

        _vote(id, dave, true); // 2*2 >= 4
        _assertResolvable(id, true, BYWEscrow.Outcome.Passed);

        assertLt(block.timestamp, escrow.getDare(id).voteEnd, "settling before voteEnd");
        _settle(id);
        assertEq(wif.balanceOf(bob), bob0 + AMT * 95 / 100);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Passed));
    }

    function test_earlyLock_fail_eligible4() public {
        (, uint256 id) = _voting(6, AMT);
        uint256 alice0 = wif.balanceOf(alice);

        _vote(id, carol, false);
        _vote(id, dave, false); // 2*2 > 4 is false -> not locked
        _assertResolvable(id, false, BYWEscrow.Outcome.None);
        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);

        _vote(id, erin, false); // 3*2 > 4
        _assertResolvable(id, true, BYWEscrow.Outcome.Failed);

        _settle(id);
        assertEq(wif.balanceOf(alice), alice0 + AMT * 90 / 100);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Failed));
    }

    function test_earlyLock_pass_notUndoneByLaterVotes() public {
        (, uint256 id) = _voting(6, AMT);
        _vote(id, carol, true);
        _vote(id, dave, true); // locked pass
        _vote(id, erin, false);
        _vote(id, frank, false); // 2-2, still pass
        _assertResolvable(id, true, BYWEscrow.Outcome.Passed);
        _settle(id);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Passed));
    }

    // ------------------------------------------------------------------
    // Outcome at voteEnd
    // ------------------------------------------------------------------

    function test_tieAtVoteEnd_passes() public {
        (, uint256 id) = _voting(6, AMT);
        _vote(id, carol, true);
        _vote(id, dave, false);

        uint64 voteEnd = escrow.getDare(id).voteEnd;
        vm.warp(voteEnd); // still open at exactly voteEnd
        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);

        vm.warp(voteEnd + 1);
        _assertResolvable(id, true, BYWEscrow.Outcome.Passed);
        uint256 bob0 = wif.balanceOf(bob);
        _settle(id);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Passed));
        assertEq(wif.balanceOf(bob), bob0 + AMT * 95 / 100);
    }

    function test_zeroVotesAtVoteEnd_passes() public {
        (, uint256 id) = _voting(6, AMT);
        vm.warp(escrow.getDare(id).voteEnd + 1);
        _assertResolvable(id, true, BYWEscrow.Outcome.Passed);
        _settle(id);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Passed));
    }

    function test_moreFailThanPassAtVoteEnd_fails() public {
        (, uint256 id) = _voting(6, AMT);
        _vote(id, carol, false);
        _vote(id, dave, false);
        _vote(id, erin, true);
        _assertResolvable(id, false, BYWEscrow.Outcome.None);
        vm.warp(escrow.getDare(id).voteEnd + 1);
        _assertResolvable(id, true, BYWEscrow.Outcome.Failed);
        _settle(id);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Failed));
    }

    // ------------------------------------------------------------------
    // Targeted and open dares
    // ------------------------------------------------------------------

    function test_targetedDare_onlyTargetAccepts() public {
        uint256 gid = _group(4);
        uint256 id = _dare(gid, carol, AMT);

        vm.prank(bob);
        vm.expectRevert(BYWEscrow.NotTarget.selector);
        escrow.acceptDare(id);

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.CreatorCannotAccept.selector);
        escrow.acceptDare(id);

        vm.prank(carol);
        escrow.acceptDare(id);
        assertEq(escrow.getDare(id).doer, carol);
    }

    function test_openDare_creatorCannotAccept_otherMemberCan() public {
        uint256 gid = _group(4);
        uint256 id = _dare(gid, address(0), AMT);

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.CreatorCannotAccept.selector);
        escrow.acceptDare(id);

        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotMember.selector);
        escrow.acceptDare(id);

        vm.prank(dave);
        escrow.acceptDare(id);
        assertEq(escrow.getDare(id).doer, dave);

        // can't be accepted twice
        vm.prank(carol);
        vm.expectRevert(BYWEscrow.InvalidState.selector);
        escrow.acceptDare(id);
    }

    function test_createDare_invalidTarget_reverts() public {
        uint256 gid = _group(3);

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.InvalidTarget.selector);
        escrow.createDare(gid, alice, AMT, DO, WIN, META); // self

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.InvalidTarget.selector);
        escrow.createDare(gid, outsider, AMT, DO, WIN, META); // non-member
    }

    // ------------------------------------------------------------------
    // Cancel
    // ------------------------------------------------------------------

    function test_cancel_whileOpen_refundsFull() public {
        uint256 gid = _group(3);
        uint256 alice0 = wif.balanceOf(alice);
        uint256 supply0 = wif.totalSupply();
        uint256 id = _dare(gid, address(0), AMT);

        vm.prank(bob);
        vm.expectRevert(BYWEscrow.NotDareCreator.selector);
        escrow.cancelDare(id);

        vm.expectEmit(true, false, false, false);
        emit BYWEscrow.DareCancelled(id);
        vm.prank(alice);
        escrow.cancelDare(id);

        assertEq(wif.balanceOf(alice), alice0, "100% refund");
        assertEq(wif.totalSupply(), supply0, "nothing burned");
        assertEq(wif.balanceOf(address(escrow)), 0);
        assertEq(uint8(escrow.getDare(id).state), uint8(BYWEscrow.DareState.Cancelled));
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.None));

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.InvalidState.selector);
        escrow.cancelDare(id);

        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidState.selector);
        escrow.acceptDare(id);

        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);
    }

    function test_cancel_afterAccept_reverts() public {
        uint256 gid = _group(3);
        uint256 id = _dare(gid, address(0), AMT);
        vm.prank(bob);
        escrow.acceptDare(id);

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.InvalidState.selector);
        escrow.cancelDare(id);

        vm.prank(bob);
        escrow.submitProof(id, PROOF);
        vm.prank(alice);
        vm.expectRevert(BYWEscrow.InvalidState.selector);
        escrow.cancelDare(id);
    }

    function test_cancel_nonexistent_reverts() public {
        vm.prank(alice);
        vm.expectRevert(BYWEscrow.NotDareCreator.selector);
        escrow.cancelDare(7);
    }

    // ------------------------------------------------------------------
    // Reverts
    // ------------------------------------------------------------------

    function test_nonMember_create_reverts() public {
        uint256 gid = _group(3);
        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotMember.selector);
        escrow.createDare(gid, address(0), AMT, DO, WIN, META);

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.NotMember.selector);
        escrow.createDare(99, address(0), AMT, DO, WIN, META); // nonexistent group
    }

    function test_nonMember_accept_reverts() public {
        uint256 gid = _group(3);
        uint256 id = _dare(gid, address(0), AMT);
        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotMember.selector);
        escrow.acceptDare(id);
    }

    function test_nonMember_vote_reverts() public {
        (, uint256 id) = _voting(3, AMT);
        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotMember.selector);
        escrow.vote(id, true);
    }

    function test_doubleVote_reverts() public {
        (, uint256 id) = _voting(6, AMT);
        _vote(id, carol, true);
        vm.prank(carol);
        vm.expectRevert(BYWEscrow.AlreadyVoted.selector);
        escrow.vote(id, false);
        assertEq(escrow.getDare(id).passVotes, 1);
        assertEq(escrow.getDare(id).failVotes, 0);
    }

    function test_doerVoting_reverts() public {
        (, uint256 id) = _voting(4, AMT);
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.DoerCannotVote.selector);
        escrow.vote(id, true);
    }

    function test_creatorVoting_reverts() public {
        // smallest possible group: the creator still cannot vote
        (, uint256 id) = _voting(3, AMT);
        vm.prank(alice);
        vm.expectRevert(BYWEscrow.CreatorCannotVote.selector);
        escrow.vote(id, false);

        (, uint256 id2) = _voting(6, AMT);
        vm.prank(alice);
        vm.expectRevert(BYWEscrow.CreatorCannotVote.selector);
        escrow.vote(id2, true);
    }

    function test_joinedAfterProof_cannotVote() public {
        (uint256 gid, uint256 id) = _voting(3, AMT);
        vm.warp(block.timestamp + 5 minutes);
        _join(gid, dave);

        vm.prank(dave);
        vm.expectRevert(BYWEscrow.NotEligibleVoter.selector);
        escrow.vote(id, false);
        assertEq(escrow.getDare(id).eligible, 1, "eligible unchanged by later joins");
    }

    /// @dev A member who joins in the same block (same timestamp) right after proof is posted
    ///      would pass a plain `joinedAt <= proofAt` check, but was not counted in `eligible`.
    ///      The join-order snapshot rejects them.
    function test_joinedSameBlockAfterProof_cannotVote() public {
        (uint256 gid, uint256 id) = _voting(3, AMT);
        _join(gid, dave);
        assertEq(escrow.joinedAt(gid, dave), escrow.getDare(id).proofAt);

        vm.prank(dave);
        vm.expectRevert(BYWEscrow.NotEligibleVoter.selector);
        escrow.vote(id, false);
    }

    function test_memberWhoJoinedAfterDareButBeforeProof_canVote() public {
        uint256 gid = _group(3);
        uint256 id = _dare(gid, address(0), AMT);
        vm.prank(bob);
        escrow.acceptDare(id);
        _join(gid, dave);
        vm.warp(block.timestamp + 1);
        vm.prank(bob);
        escrow.submitProof(id, PROOF);

        assertEq(escrow.getDare(id).eligible, 2); // carol + dave
        _vote(id, dave, true); // 1*2 >= 2 -> pass locked
        _assertResolvable(id, true, BYWEscrow.Outcome.Passed);
        _settle(id);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Passed));
    }

    function test_voteAfterVoteEnd_reverts() public {
        (, uint256 id) = _voting(6, AMT);
        uint64 voteEnd = escrow.getDare(id).voteEnd;

        vm.warp(voteEnd); // last valid second
        _vote(id, carol, true);

        vm.warp(voteEnd + 1);
        vm.prank(dave);
        vm.expectRevert(BYWEscrow.VotingClosed.selector);
        escrow.vote(id, true);
    }

    function test_voteBeforeProof_reverts() public {
        uint256 gid = _group(3);
        uint256 id = _dare(gid, address(0), AMT);
        vm.prank(carol);
        vm.expectRevert(BYWEscrow.InvalidState.selector);
        escrow.vote(id, true);
    }

    function test_proofAfterDeadline_reverts() public {
        uint256 gid = _group(3);
        uint256 id = _dare(gid, address(0), AMT);
        vm.prank(bob);
        escrow.acceptDare(id);

        vm.warp(block.timestamp + DO + 1);
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.ProofDeadlinePassed.selector);
        escrow.submitProof(id, PROOF);
    }

    function test_proofAtExactDeadline_ok() public {
        uint256 gid = _group(3);
        uint256 id = _dare(gid, address(0), AMT);
        vm.prank(bob);
        escrow.acceptDare(id);
        vm.warp(block.timestamp + DO);
        vm.prank(bob);
        escrow.submitProof(id, PROOF);
        assertEq(uint8(escrow.getDare(id).state), uint8(BYWEscrow.DareState.Voting));
    }

    function test_proofByNonDoer_reverts() public {
        uint256 gid = _group(3);
        uint256 id = _dare(gid, address(0), AMT);

        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidState.selector); // not accepted yet
        escrow.submitProof(id, PROOF);

        vm.prank(bob);
        escrow.acceptDare(id);
        vm.prank(carol);
        vm.expectRevert(BYWEscrow.NotDoer.selector);
        escrow.submitProof(id, PROOF);

        vm.prank(bob);
        escrow.submitProof(id, PROOF);
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidState.selector); // twice
        escrow.submitProof(id, PROOF);
    }

    function test_settleTooEarly_reverts() public {
        uint256 gid = _group(6);
        uint256 id = _dare(gid, address(0), AMT);

        // Open
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);

        // Accepted, before deadline
        vm.prank(bob);
        escrow.acceptDare(id);
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);

        // Voting, no lock, before voteEnd
        vm.prank(bob);
        escrow.submitProof(id, PROOF);
        _vote(id, carol, true);
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);

        // nonexistent
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(999);
        _assertResolvable(999, false, BYWEscrow.Outcome.None);
    }

    function test_settleTwice_reverts() public {
        (, uint256 id) = _voting(3, AMT);
        _vote(id, carol, true);
        _settle(id);
        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);
    }

    function test_settleTwice_expired_reverts() public {
        uint256 gid = _group(3);
        uint256 id = _dare(gid, address(0), AMT);
        vm.prank(bob);
        escrow.acceptDare(id);
        vm.warp(block.timestamp + DO + 1);
        _settle(id);
        vm.prank(outsider);
        vm.expectRevert(BYWEscrow.NotResolvable.selector);
        escrow.settle(id);
    }

    function test_amountOutOfRange_reverts() public {
        uint256 gid = _group(3);
        uint256 max = escrow.maxBounty();

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.AmountOutOfRange.selector);
        escrow.createDare(gid, address(0), max + 1, DO, WIN, META);

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.AmountOutOfRange.selector);
        escrow.createDare(gid, address(0), 1e18 - 1, DO, WIN, META);

        // both edges are fine
        vm.prank(alice);
        escrow.createDare(gid, address(0), max, DO, WIN, META);
        vm.prank(alice);
        escrow.createDare(gid, address(0), 1e18, DO, WIN, META);
    }

    function test_invalidVoteWindow_reverts() public {
        uint256 gid = _group(3);
        uint32[6] memory bad = [uint32(0), 14 minutes, 30 minutes, 2 hours, 12 hours, 48 hours];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(alice);
            vm.expectRevert(BYWEscrow.InvalidVoteWindow.selector);
            escrow.createDare(gid, address(0), AMT, DO, bad[i], META);
        }
        uint32[4] memory good = [uint32(15 minutes), 1 hours, 6 hours, 24 hours];
        for (uint256 i; i < good.length; ++i) {
            vm.prank(alice);
            escrow.createDare(gid, address(0), AMT, DO, good[i], META);
        }
    }

    function test_doDurationOutOfRange_reverts() public {
        uint256 gid = _group(3);

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.InvalidDoDuration.selector);
        escrow.createDare(gid, address(0), AMT, 1 hours - 1, WIN, META);

        vm.prank(alice);
        vm.expectRevert(BYWEscrow.InvalidDoDuration.selector);
        escrow.createDare(gid, address(0), AMT, 7 days + 1, WIN, META);

        vm.prank(alice);
        escrow.createDare(gid, address(0), AMT, 1 hours, WIN, META);
        vm.prank(alice);
        escrow.createDare(gid, address(0), AMT, 7 days, WIN, META);
    }

    function test_createDare_withoutApproval_reverts() public {
        uint256 gid = _group(3);
        vm.prank(alice);
        wif.approve(address(escrow), 0);
        vm.prank(alice);
        vm.expectRevert(); // ERC20InsufficientAllowance
        escrow.createDare(gid, address(0), AMT, DO, WIN, META);
        assertEq(escrow.dareCount(), 0, "state rolled back");
    }

    // ------------------------------------------------------------------
    // Owner powers
    // ------------------------------------------------------------------

    function test_setMaxBounty() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.setMaxBounty(1_000_000e18);

        vm.startPrank(owner);
        vm.expectRevert(BYWEscrow.InvalidMaxBounty.selector);
        escrow.setMaxBounty(5_000_000e18 + 1);
        vm.expectRevert(BYWEscrow.InvalidMaxBounty.selector);
        escrow.setMaxBounty(1e18 - 1);

        vm.expectEmit(false, false, false, true);
        emit BYWEscrow.MaxBountyUpdated(5_000_000e18);
        escrow.setMaxBounty(5_000_000e18);
        vm.stopPrank();
        assertEq(escrow.maxBounty(), 5_000_000e18);

        uint256 gid = _group(3);
        vm.prank(alice);
        escrow.createDare(gid, address(0), 5_000_000e18, DO, WIN, META);

        vm.prank(owner);
        escrow.setMaxBounty(1e18);
        vm.prank(alice);
        vm.expectRevert(BYWEscrow.AmountOutOfRange.selector);
        escrow.createDare(gid, address(0), 2e18, DO, WIN, META);
    }

    function test_pause_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.pause();

        vm.prank(owner);
        escrow.pause();
        assertTrue(escrow.paused());

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.unpause();

        vm.prank(owner);
        escrow.unpause();
        assertFalse(escrow.paused());
    }

    function test_ownershipTransfer_isTwoStep() public {
        vm.prank(owner);
        escrow.transferOwnership(alice);
        assertEq(escrow.owner(), owner, "not transferred until accepted");
        assertEq(escrow.pendingOwner(), alice);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        escrow.acceptOwnership();

        vm.prank(alice);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), alice);
    }

    function test_noReceive_rejectsEth() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(escrow).call{value: 1 ether}("");
        assertFalse(ok);
        vm.prank(alice);
        (bool ok2,) = address(escrow).call{value: 1 ether}(hex"deadbeef");
        assertFalse(ok2);
    }

    // ------------------------------------------------------------------
    // Pause
    // ------------------------------------------------------------------

    function test_pause_blocksOnlyCreateGroupAndCreateDare() public {
        uint256 gid = _group(4); // alice, bob, carol, dave
        uint256 idCancel = _dare(gid, address(0), AMT);
        uint256 idVote = _dare(gid, address(0), AMT);
        uint256 idExpire = _dare(gid, carol, AMT);

        vm.prank(owner);
        escrow.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.createGroup(false);

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.createDare(gid, address(0), AMT, DO, WIN, META);

        // joins still work
        _join(gid, erin);

        // cancel works
        uint256 alice0 = wif.balanceOf(alice);
        vm.prank(alice);
        escrow.cancelDare(idCancel);
        assertEq(wif.balanceOf(alice), alice0 + AMT);

        // accept, proof, vote, settle work (erin joined before proof -> eligible 3)
        vm.prank(bob);
        escrow.acceptDare(idVote);
        vm.prank(bob);
        escrow.submitProof(idVote, PROOF);
        assertEq(escrow.getDare(idVote).eligible, 3);
        _vote(idVote, carol, true);
        _vote(idVote, dave, true);
        _settle(idVote);
        assertEq(uint8(_outcome(idVote)), uint8(BYWEscrow.Outcome.Passed));

        // expiry settle works
        vm.prank(carol);
        escrow.acceptDare(idExpire);
        vm.warp(block.timestamp + DO + 1);
        _settle(idExpire);
        assertEq(uint8(_outcome(idExpire)), uint8(BYWEscrow.Outcome.Expired));

        assertEq(wif.balanceOf(address(escrow)), 0);

        vm.prank(owner);
        escrow.unpause();
        vm.prank(alice);
        escrow.createDare(gid, address(0), AMT, DO, WIN, META);
    }

    // ------------------------------------------------------------------
    // Smart-contract accounts (EIP-7702 / Privy): no EOA assumptions
    // ------------------------------------------------------------------

    function test_contractWallets_canCreateJoinAcceptVote() public {
        SimpleWallet w1 = new SimpleWallet(alice);
        SimpleWallet w2 = new SimpleWallet(bob);
        SimpleWallet w3 = new SimpleWallet(carol);
        assertGt(address(w1).code.length, 0);
        wif.transfer(address(w1), AMT);

        vm.startPrank(alice);
        w1.execute(address(wif), abi.encodeCall(IERC20.approve, (address(escrow), AMT)));
        uint256 gid = abi.decode(w1.execute(address(escrow), abi.encodeCall(BYWEscrow.createGroup, (true))), (uint256));
        vm.stopPrank();

        // permits are issued to the wallet addresses, which have code
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig2 = _sig(gid, address(w2), deadline);
        bytes memory sig3 = _sig(gid, address(w3), deadline);
        vm.prank(bob);
        w2.execute(address(escrow), abi.encodeCall(BYWEscrow.joinGroup, (gid, deadline, sig2)));
        vm.prank(carol);
        w3.execute(address(escrow), abi.encodeCall(BYWEscrow.joinGroup, (gid, deadline, sig3)));

        vm.prank(alice);
        uint256 id = abi.decode(
            w1.execute(address(escrow), abi.encodeCall(BYWEscrow.createDare, (gid, address(w2), AMT, DO, WIN, META))),
            (uint256)
        );

        vm.startPrank(bob);
        w2.execute(address(escrow), abi.encodeCall(BYWEscrow.acceptDare, (id)));
        w2.execute(address(escrow), abi.encodeCall(BYWEscrow.submitProof, (id, PROOF)));
        vm.stopPrank();

        vm.prank(carol);
        w3.execute(address(escrow), abi.encodeCall(BYWEscrow.vote, (id, true)));

        escrow.settle(id);
        assertEq(wif.balanceOf(address(w2)), AMT * 95 / 100);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Passed));
    }

    /// @dev Addresses carrying an EIP-7702 delegation designator (0xef0100 || impl) behave like any caller.
    function test_7702DelegatedAddresses_fullFlow() public {
        SimpleWallet impl = new SimpleWallet(address(0));
        address u1 = makeAddr("7702-creator");
        address u2 = makeAddr("7702-doer");
        address u3 = makeAddr("7702-voter");
        address[3] memory us = [u1, u2, u3];
        for (uint256 i; i < 3; ++i) {
            vm.etch(us[i], abi.encodePacked(hex"ef0100", address(impl)));
            assertEq(us[i].code.length, 23);
        }
        wif.transfer(u1, AMT);

        vm.startPrank(u1);
        wif.approve(address(escrow), AMT);
        uint256 gid = escrow.createGroup(false);
        vm.stopPrank();
        _join(gid, u2);
        _join(gid, u3);

        vm.prank(u1);
        uint256 id = escrow.createDare(gid, address(0), AMT, DO, WIN, META);
        vm.startPrank(u2);
        escrow.acceptDare(id);
        escrow.submitProof(id, PROOF);
        vm.stopPrank();
        vm.prank(u3);
        escrow.vote(id, false);
        escrow.settle(id);

        assertEq(wif.balanceOf(u1), AMT * 90 / 100);
    }

    // ------------------------------------------------------------------
    // Multiple concurrent dares and groups
    // ------------------------------------------------------------------

    function test_concurrentDares_isolated() public {
        uint256 g1 = _group(3); // alice, bob, carol
        vm.prank(dave);
        uint256 g2 = escrow.createGroup(true);
        _join(g2, erin);
        _join(g2, frank);

        uint256 a = _dare(g1, bob, AMT);
        vm.prank(dave);
        uint256 b = escrow.createDare(g2, erin, 2 * AMT, DO, WIN, META);

        // a g1 member can't act on g2's dare
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.NotMember.selector);
        escrow.acceptDare(b);

        vm.prank(bob);
        escrow.acceptDare(a);
        vm.prank(erin);
        escrow.acceptDare(b);
        vm.prank(bob);
        escrow.submitProof(a, PROOF);
        vm.prank(erin);
        escrow.submitProof(b, PROOF);

        vm.prank(carol);
        vm.expectRevert(BYWEscrow.NotMember.selector);
        escrow.vote(b, true);

        _vote(a, carol, false);
        _vote(b, frank, true);

        uint256 alice0 = wif.balanceOf(alice);
        uint256 erin0 = wif.balanceOf(erin);
        _settle(a);
        assertEq(wif.balanceOf(address(escrow)), 2 * AMT, "only dare a paid out");
        _settle(b);
        assertEq(wif.balanceOf(alice), alice0 + AMT * 90 / 100);
        assertEq(wif.balanceOf(erin), erin0 + 2 * AMT * 95 / 100);
        assertEq(wif.balanceOf(address(escrow)), 0);
    }
}

// ----------------------------------------------------------------------
// Fuzz
// ----------------------------------------------------------------------

contract BYWEscrowFuzzTest is BYWBase {
    function testFuzz_passSplit(uint256 amount) public {
        amount = bound(amount, 1e18, escrow.maxBounty());
        (, uint256 id) = _voting(3, amount);
        uint256 supply0 = wif.totalSupply();
        uint256 bob0 = wif.balanceOf(bob);

        _vote(id, carol, true);
        _settle(id);

        uint256 payout = wif.balanceOf(bob) - bob0;
        uint256 burned = supply0 - wif.totalSupply();
        assertEq(payout + burned, amount);
        assertEq(burned, amount * 500 / 10_000);
        assertEq(wif.balanceOf(address(escrow)), 0);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Passed));
    }

    function testFuzz_failSplit(uint256 amount) public {
        amount = bound(amount, 1e18, escrow.maxBounty());
        (, uint256 id) = _voting(3, amount);
        uint256 supply0 = wif.totalSupply();
        uint256 alice0 = wif.balanceOf(alice);

        _vote(id, carol, false);
        _settle(id);

        uint256 payout = wif.balanceOf(alice) - alice0;
        uint256 burned = supply0 - wif.totalSupply();
        assertEq(payout + burned, amount);
        assertEq(burned, amount * 1000 / 10_000);
        assertEq(wif.balanceOf(address(escrow)), 0);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Failed));
    }

    function testFuzz_expiredSplit(uint256 amount, uint32 doDuration, uint256 lateBy) public {
        amount = bound(amount, 1e18, escrow.maxBounty());
        doDuration = uint32(bound(doDuration, 1 hours, 7 days));
        lateBy = bound(lateBy, 1, 365 days);
        uint256 gid = _group(3);
        vm.prank(alice);
        uint256 id = escrow.createDare(gid, address(0), amount, doDuration, WIN, META);
        vm.prank(bob);
        escrow.acceptDare(id);
        vm.warp(block.timestamp + doDuration + lateBy);

        uint256 supply0 = wif.totalSupply();
        uint256 alice0 = wif.balanceOf(alice);
        _settle(id);

        uint256 payout = wif.balanceOf(alice) - alice0;
        uint256 burned = supply0 - wif.totalSupply();
        assertEq(payout, amount);
        assertEq(burned, 0);
        assertEq(wif.balanceOf(address(escrow)), 0);
        assertEq(uint8(_outcome(id)), uint8(BYWEscrow.Outcome.Expired));
    }

    function testFuzz_splitUpToHardCap(uint256 amount, bool pass) public {
        uint256 cap = escrow.HARD_CAP();
        vm.prank(owner);
        escrow.setMaxBounty(cap);
        amount = bound(amount, 1e18, cap);
        (, uint256 id) = _voting(3, amount);
        uint256 supply0 = wif.totalSupply();
        address recipient = pass ? bob : alice;
        uint256 r0 = wif.balanceOf(recipient);

        _vote(id, carol, pass);
        _settle(id);

        assertEq((wif.balanceOf(recipient) - r0) + (supply0 - wif.totalSupply()), amount);
        assertEq(wif.balanceOf(address(escrow)), 0);
    }

    /// @dev Random group sizes and votes: outcome always matches the spec rules computed independently.
    function testFuzz_outcomeRules(uint8 sizeSeed, uint8 passSeed, uint8 failSeed, bool waitForEnd) public {
        uint256 size = bound(sizeSeed, 3, 6);
        (, uint256 id) = _voting(size, AMT);
        BYWEscrow.Dare memory d = escrow.getDare(id);
        uint256 eligible = d.eligible;
        assertEq(eligible, size - 2);

        address[4] memory voters = [carol, dave, erin, frank];
        uint256 p = bound(passSeed, 0, eligible);
        uint256 f = bound(failSeed, 0, eligible - p);
        for (uint256 i; i < p; ++i) {
            _vote(id, voters[i], true);
        }
        for (uint256 i; i < f; ++i) {
            _vote(id, voters[p + i], false);
        }
        if (waitForEnd) vm.warp(d.voteEnd + 1);

        bool passLock = p * 2 >= eligible;
        bool failLock = f * 2 > eligible;
        assertFalse(passLock && failLock, "locks are exclusive");
        bool decided = passLock || failLock || waitForEnd;
        bool expectedPass = passLock ? true : failLock ? false : p >= f;
        BYWEscrow.Outcome expected = expectedPass ? BYWEscrow.Outcome.Passed : BYWEscrow.Outcome.Failed;

        if (decided) {
            _assertResolvable(id, true, expected);
            _settle(id);
            assertEq(uint8(_outcome(id)), uint8(expected));
        } else {
            _assertResolvable(id, false, BYWEscrow.Outcome.None);
            vm.expectRevert(BYWEscrow.NotResolvable.selector);
            escrow.settle(id);
        }
    }

    function testFuzz_joinPermitDigest_matchesHelper(uint256 gid, address account, uint256 deadline) public view {
        assertEq(
            escrow.joinPermitDigest(gid, account, deadline), _permitDigest(address(escrow), gid, account, deadline)
        );
    }

    function testFuzz_join_wrongKey_reverts(uint256 pk) public {
        // valid secp256k1 private keys are in [1, n-1]
        pk = bound(pk, 1, 115792089237316195423570985008687907852837564279074904382605163141518161494336);
        vm.assume(vm.addr(pk) != signer);
        vm.prank(alice);
        uint256 gid = escrow.createGroup(false);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signPermit(pk, address(escrow), gid, bob, deadline);
        vm.prank(bob);
        vm.expectRevert(BYWEscrow.InvalidPermitSigner.selector);
        escrow.joinGroup(gid, deadline, sig);
    }
}

// ----------------------------------------------------------------------
// Invariant: escrow balance == sum of live bounties
// ----------------------------------------------------------------------

contract EscrowHandler is PermitSigner {
    BYWEscrow public escrow;
    MockWIF public wif;
    uint256 public groupId;
    address[] public actors;
    uint256 public ghostBurned;
    uint256 public ghostSettled;
    uint256 public ghostExpired;
    uint256 public ghostCancelled;

    uint32[4] internal windows = [uint32(15 minutes), 1 hours, 6 hours, 24 hours];

    constructor(BYWEscrow escrow_, MockWIF wif_) {
        escrow = escrow_;
        wif = wif_;
    }

    /// @dev Called by the test after it funds the handler with the mock supply.
    function init() external {
        if (groupId != 0) return; // the fuzzer can call this too; only the first call does anything
        for (uint256 i; i < 6; ++i) {
            _addActor(makeAddr(string.concat("actor", vm.toString(i))));
        }
        vm.prank(actors[0]);
        groupId = escrow.createGroup(true);
        for (uint256 i = 1; i < 6; ++i) {
            _permitJoin(actors[i]);
        }
    }

    function _addActor(address a) internal {
        actors.push(a);
        wif.transfer(a, 10_000_000e18);
        vm.prank(a);
        wif.approve(address(escrow), type(uint256).max);
    }

    function _permitJoin(address a) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signPermit(SIGNER_PK, address(escrow), groupId, a, deadline);
        vm.prank(a);
        escrow.joinGroup(groupId, deadline, sig);
    }

    function joinNew(uint256 seed) external {
        if (actors.length >= 12) return;
        address a = makeAddr(string.concat("late", vm.toString(seed % 1000)));
        if (escrow.isMember(groupId, a)) return;
        _addActor(a);
        _permitJoin(a);
    }

    function createDare(uint256 actorSeed, uint256 targetSeed, uint256 amount, uint256 durSeed, uint256 winSeed)
        external
    {
        address creator = actors[actorSeed % actors.length];
        address target = targetSeed % 3 == 0 ? address(0) : actors[targetSeed % actors.length];
        if (target == creator) target = address(0);
        amount = bound(amount, 1e18, 100_000e18);
        uint32 dur = uint32(bound(durSeed, 1 hours, 7 days));
        vm.prank(creator);
        escrow.createDare(groupId, target, amount, dur, windows[winSeed % 4], keccak256(abi.encode(actorSeed)));
    }

    /// @dev Starting at a random dare, find the first one in `want` state (so sequences make progress).
    function _find(uint256 seed, BYWEscrow.DareState want)
        internal
        view
        returns (uint256 id, BYWEscrow.Dare memory d, bool ok)
    {
        uint256 n = escrow.dareCount();
        for (uint256 k; k < n; ++k) {
            id = (seed % n + k) % n + 1;
            d = escrow.getDare(id);
            if (d.state == want) return (id, d, true);
        }
        return (0, d, false);
    }

    function cancel(uint256 seed) external {
        if (seed % 4 != 0) return; // cancel less often so more dares run to settlement
        (uint256 id, BYWEscrow.Dare memory d, bool ok) = _find(seed, BYWEscrow.DareState.Open);
        if (!ok) return;
        vm.prank(d.creator);
        escrow.cancelDare(id);
        ++ghostCancelled;
    }

    function accept(uint256 seed, uint256 actorSeed) external {
        (uint256 id, BYWEscrow.Dare memory d, bool ok) = _find(seed, BYWEscrow.DareState.Open);
        if (!ok) return;
        address who = d.target;
        if (who == address(0)) {
            who = actors[actorSeed % actors.length];
            if (who == d.creator) who = actors[(actorSeed % actors.length + 1) % actors.length];
        }
        vm.prank(who);
        escrow.acceptDare(id);
    }

    function proof(uint256 seed) external {
        if (seed % 3 == 0) return; // doers sometimes ghost, so the Expired path gets exercised
        (uint256 id, BYWEscrow.Dare memory d, bool ok) = _find(seed, BYWEscrow.DareState.Accepted);
        if (!ok || block.timestamp > d.proofDeadline) return;
        vm.prank(d.doer);
        escrow.submitProof(id, keccak256(abi.encode(id)));
    }

    function vote(uint256 seed, uint256 actorSeed, bool pass) external {
        (uint256 id,, bool ok) = _find(seed, BYWEscrow.DareState.Voting);
        if (!ok) return;
        address who = actors[actorSeed % actors.length];
        vm.prank(who);
        try escrow.vote(id, pass) {} catch {} // ineligible voters are expected to revert
        BYWEscrow.Dare memory after_ = escrow.getDare(id);
        require(uint256(after_.passVotes) + after_.failVotes <= after_.eligible, "votes exceed eligible");
    }

    function settle(uint256 seed, bool fromVoting) external {
        BYWEscrow.DareState first = fromVoting ? BYWEscrow.DareState.Voting : BYWEscrow.DareState.Accepted;
        BYWEscrow.DareState second = fromVoting ? BYWEscrow.DareState.Accepted : BYWEscrow.DareState.Voting;
        (uint256 id,, bool ok) = _find(seed, first);
        if (!ok) (id,, ok) = _find(seed, second);
        if (!ok) return;
        (bool can, BYWEscrow.Outcome expected) = escrow.resolvable(id);
        uint256 supply0 = wif.totalSupply();
        if (can) {
            escrow.settle(id);
            uint256 burned = supply0 - wif.totalSupply();
            ghostBurned += burned;
            ++ghostSettled;
            require(escrow.getDare(id).outcome == expected, "outcome differs from resolvable()");
            if (expected == BYWEscrow.Outcome.Expired) {
                ++ghostExpired;
                require(burned == 0, "expired dare burned tokens");
            } else {
                require(burned > 0, "voted dare did not burn");
            }
        } else {
            try escrow.settle(id) {
                revert("settled while resolvable() said no");
            } catch {}
        }
    }

    function warp(uint256 secs) external {
        // mostly short hops; sometimes jump past every possible proof deadline (max doDuration is 7 days)
        uint256 hop = secs % 5 == 0 ? 7 days + 1 : bound(secs, 1, 2 days);
        vm.warp(block.timestamp + hop);
    }
}

/// forge-config: default.invariant.depth = 128
contract BYWEscrowInvariantTest is PermitSigner {
    BYWEscrow internal escrow;
    MockWIF internal wif;
    EscrowHandler internal handler;
    uint256 internal initialSupply;

    function setUp() public {
        wif = new MockWIF(address(this), 1_000_000_000e18);
        escrow = new BYWEscrow(IERC20(address(wif)), vm.addr(SIGNER_PK));
        handler = new EscrowHandler(escrow, wif);
        wif.transfer(address(handler), wif.balanceOf(address(this)));
        handler.init();
        initialSupply = wif.totalSupply();
        targetContract(address(handler));
    }

    function _liveBounties() internal view returns (uint256 sum) {
        uint256 n = escrow.dareCount();
        for (uint256 i = 1; i <= n; ++i) {
            BYWEscrow.Dare memory d = escrow.getDare(i);
            if (
                d.state == BYWEscrow.DareState.Open || d.state == BYWEscrow.DareState.Accepted
                    || d.state == BYWEscrow.DareState.Voting
            ) sum += d.amount;
        }
    }

    function invariant_balanceEqualsLiveBounties() public view {
        assertEq(wif.balanceOf(address(escrow)), _liveBounties());
    }

    /// @dev Supply only ever falls, and only by settle burns (expired settles burn nothing).
    function invariant_burnsMatchSettlements() public view {
        assertEq(initialSupply - wif.totalSupply(), handler.ghostBurned());
    }

    function invariant_votesNeverExceedEligible() public view {
        uint256 n = escrow.dareCount();
        for (uint256 i = 1; i <= n; ++i) {
            BYWEscrow.Dare memory d = escrow.getDare(i);
            assertLe(uint256(d.passVotes) + d.failVotes, d.eligible);
            if (d.state == BYWEscrow.DareState.Voting) assertGe(d.eligible, 1, "witness rule");
        }
    }

    /// @dev Records how far each run got, so we can see the invariants exercised real settlements.
    function afterInvariant() public {
        emit log_named_uint("dares created", escrow.dareCount());
        emit log_named_uint("dares settled", handler.ghostSettled());
        emit log_named_uint("dares expired", handler.ghostExpired());
        emit log_named_uint("dares cancelled", handler.ghostCancelled());
    }
}
