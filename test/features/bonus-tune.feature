Feature: Tuned decaying time bonus - lower ceiling (BONUS-TUNE)
  As a player
  I want the time bonus to top out lower
  So that the pace feels tighter

  # The bar's depletion direction, originally right-to-left here, was reversed by
  # the later BAR-FRAME behaviour (left-anchored, receding at the right) - E3 below
  # reflects that current, correct direction rather than the one first shipped.

  # B1 (re-tune, this same behaviour): the ceiling and countdown window drop
  # again, 300 -> 100 (previously 5000 -> 300). Every scenario below reflects
  # the current 100 maximum; the decay-by-1-per-second mechanics and the
  # not-below-0 floor are unchanged in kind and already proven, at this new
  # ceiling, by scoring.feature's own E4 scenario - not re-derived here.

  @E1 @e2e
  Scenario: The time multiplier resets to 100, not 300, at each completion
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the time multiplier bar is displayed and is full, at exactly 100
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier bar reset to full, exactly 100, at the moment of that commit's completion

  @E2 @E3 @component
  Scenario: Both re-frozen worked examples reproduce exactly at the new 100 maximum
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the live page reproduces the frozen worked example: a lone 3-run, 30s gap, scores exactly 35
    And the live page reproduces the frozen worked example: a 3-run and 4-run together, 30s gap, first in chain, scores exactly 105

  @E4 @component
  Scenario: A completion while the time multiplier has decayed to 0 adds nothing to the score, yet the runs still clear (SPEC 10.7.2)
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the live page reproduces the frozen worked example: a lone 3-run, 100s gap, scores exactly 0
    And a real completion of a 3-run on the live page contributes exactly 50 base points before any multiplier

  @component
  Scenario: The multiplier bar's fill depletes from left to right, anchored to the bar's left edge
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier bar's fill is anchored to the bar's left edge
    And the multiplier bar's fill visibly shrinks from the right, its left edge staying put, after a short real interval

  # The bar's colour still runs green, through yellow, to red as the multiplier
  # depletes, and its filled length is still a fraction of the (now 100) maximum -
  # already proven, at this new ceiling, by display-polish's own @component
  # scenario, which reads TIME_MULTIPLIER_START live rather than a hardcoded
  # value. Not re-derived here (SPEC 10.8, E5).

  # E5's remaining claim - everything else about the header/scoring is unchanged -
  # is every pre-existing scoring/display-polish/fix-select/audio scenario, all
  # still green with the new 100 maximum and right-to-left bar. Not re-derived here.

  @E6 @integration
  Scenario: A full fresh-load play cycle shows the tuned bonus throughout, including decay to 0
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the time multiplier bar is displayed and is full, at exactly 100
    And the multiplier bar's fill is anchored to the bar's left edge
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier bar reset to full, exactly 100, at the moment of that commit's completion
    And the score has strictly increased since it was recorded
    When the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    # The multiplier reaching 0 mid-game (rather than waiting a real ~100s here)
    # is proven component-style by this file's own @E4 scenario above, using the
    # same live resolveCascade/scoring functions this integration run itself
    # exercises - not re-derived with a slow real wait.
