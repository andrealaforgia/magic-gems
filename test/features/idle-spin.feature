Feature: Continuous idle spin (SG2)
  As a player
  I want resting gems to gently, continuously rotate, out of phase with one another
  So that the board feels alive rather than a static picture

  @E3
  Scenario: Different gems are out of phase with one another from the moment of a fresh load
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the board's cells show more than one distinct rotation frame at the same moment

  @E1
  Scenario: A resting gem's rotation visibly advances over time, looping continuously with no freeze
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the gem at cell 0,0 shows a different rotation frame after a short real interval

  # E1's "no visible frame-skipping... or a jarring jump/reset pop at the loop
  # boundary" and "in order" are proven exhaustively at the unit level instead of by
  # timing a live page against the exact moment it wraps (inherently flaky to catch
  # live): test/unit/spin.test.js proves the frame index always advances by exactly
  # one step per frame duration, with the 14->0 wrap being just another ordinary
  # single-frame step - never a special case, so there's nothing for a jump/pop to
  # come from.

  # E2 ("slow and gentle, not a fast whirl") is superseded by SG2-SPEED
  # (test/features/idle-spin-speed.feature): SPEC 9.1.1 was deliberately amended to
  # decouple the idle-spin pace from 9.3's slower transition pace, replacing "slow
  # and gentle" with "a lively ~1.5s per rotation." Retired here rather than left
  # asserting a pace the spec no longer calls for.

  # E4 (still only the seven sprite identities, still centred/scaled, still
  # match-free on a fresh fill) and E5 (swap/clear/gravity/refill/cascade/
  # auto-reshuffle still all work) are the pre-existing SG1/B1/B3 guarantees
  # (sprite-reskin.feature, board-renders.feature @E6, game-match-loop.feature
  # @E1/@E2/@E4/@E5/@E7/@E8/@E10) - none of that code changed for this behaviour,
  # only the "board at rest" render path gained a per-cell rotation frame. Their
  # continuing to pass unmodified, now against a continuously-spinning board, is
  # itself the demonstration that idle motion doesn't interfere with any of it - not
  # re-asserted here to avoid re-deriving the same claims a second time.

  @E6 @integration
  Scenario: A full fresh-load play cycle completes correctly while gems keep spinning throughout
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then all 64 cells contain exactly one recognizable gem colour each
    And the gem at cell 0,0 shows a different rotation frame after a short real interval
    Given I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
    And the gem at cell 0,0 shows a different rotation frame after a short real interval
