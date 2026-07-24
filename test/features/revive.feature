Feature: A single-gem revive replaces the whole-board reshuffle (REVIVE)
  As a player
  I want a stuck board fixed with the smallest possible change
  So that play never dead-ends without the whole board being shuffled away

  # E1-E3, E5 call the live page's own unmodified ensurePlayable directly against a
  # known stuck board - the same technique game-match-loop.feature's own
  # (now-superseded) reshuffle check used, since there's no keyboard-only way to
  # force a stuck board on demand.
  @E1 @component
  Scenario: A stuck board is revived in place, never replaced by a whole-board reshuffle
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I apply the live page's own ensurePlayable to a known stuck board
    Then the revived result is never a whole-board reshuffle

  @E2 @component
  Scenario: The normal case changes exactly one gem to a type that creates a valid move
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I apply the live page's own ensurePlayable to a known stuck board
    Then exactly one cell was changed by the revive

  @E3 @component
  Scenario: The revived board always has at least one valid move and no immediate match
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I apply the live page's own ensurePlayable to a known stuck board
    Then the revived result has no pre-existing match
    And the revived result has at least one valid move

  # E4 (the changed cell briefly spins through its rotation frames, then rests
  # static like every other gem) is proven at the unit level -
  # test/unit/spin.test.js for the frame-cycling math (it settles exactly back on
  # frame 0) and test/unit/render.test.js for drawGem correctly drawing whichever
  # frame it's given. Provoking a real revive through genuine random play to
  # observe this live isn't practical on demand - the same limitation already
  # accepted for the reshuffle sound event (test/unit/audio-cues.test.js). Not
  # re-derived here.

  @E5 @component
  Scenario: The rare degenerate fallback still never reshuffles the whole board
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the live page's incremental revive fallback finds a valid move within a bounded number of changes

  @E6 @integration
  Scenario: Normal play continues to work correctly with the revive mechanism in place
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
  # This proves ordinary swap/cascade/gravity/refill play is unaffected by REVIVE's
  # change to ensurePlayable. The stuck-board branch itself is separately proven
  # live above (E1/E3, same known stuck board) - forcing an actual mid-play stuck
  # state through genuine random play isn't practical on demand.
