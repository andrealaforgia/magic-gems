Feature: Tuned decaying time bonus - lower ceiling (BONUS-TUNE)
  As a player
  I want the time bonus to top out lower
  So that the pace feels tighter

  # The bar's depletion direction, originally right-to-left here, was reversed by
  # the later BAR-FRAME behaviour (left-anchored, receding at the right) - E3 below
  # reflects that current, correct direction rather than the one first shipped.

  @E1 @e2e
  Scenario: The time multiplier resets to 300, not 5000, at each completion
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the time multiplier bar is displayed and is full, at exactly 300
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier bar reset to full, exactly 300, at the moment of that commit's completion

  @E2 @component
  Scenario: Both re-frozen worked examples reproduce exactly at the new 300 maximum
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the live page reproduces the frozen worked example: a lone 3-run, 30s gap, scores exactly 135
    And the live page reproduces the frozen worked example: a 3-run and 4-run together, 30s gap, first in chain, scores exactly 405

  @E3 @e2e
  Scenario: The multiplier bar's fill depletes from left to right, anchored to the bar's left edge
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier bar's fill is anchored to the bar's left edge
    And the multiplier bar's fill visibly shrinks from the right, its left edge staying put, after a short real interval

  # E4 (the bar's colour still runs green, through yellow, to red as the multiplier
  # depletes) is already proven, at this same new 300 maximum, by display-polish's
  # own @component scenario - it reads TIME_MULTIPLIER_START live rather than a
  # hardcoded value, so it already covers the tuned ceiling. Not re-derived here.

  # E5 (everything else about the header/scoring is unchanged) is every pre-existing
  # scoring/display-polish/fix-select/audio scenario, all still green with the new
  # 300 maximum and right-to-left bar. Not re-derived here.

  @E6 @integration
  Scenario: A full fresh-load play cycle shows the tuned bonus throughout
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the time multiplier bar is displayed and is full, at exactly 300
    And the multiplier bar's fill is anchored to the bar's left edge
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier bar reset to full, exactly 300, at the moment of that commit's completion
    And the score has strictly increased since it was recorded
    When the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
