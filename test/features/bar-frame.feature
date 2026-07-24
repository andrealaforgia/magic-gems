Feature: A thick white frame around the multiplier bar (BAR-FRAME)
  As a player
  I want the multiplier bar visually framed
  So that it reads clearly as a bounded gauge against the background

  @E3
  Scenario: A thick white border surrounds the multiplier bar at all times
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier bar has a thick white border
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the multiplier bar has a thick white border

  # E1 (the bar's fill is anchored to its left edge and recedes at the right as the
  # multiplier depletes) and E2 (full width at the 300 maximum) are covered by
  # bonus-tune.feature's own E3 scenario, corrected to this direction. Not
  # re-derived here.

  # E4 (bar position, colour scheme, and generous height are unchanged) is every
  # pre-existing display-polish/bonus-tune scenario, all still green with the
  # border and corrected direction in place. Not re-derived here.

  @E5 @integration
  Scenario: A full fresh-load play cycle shows the framed, left-anchored bar throughout
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier bar has a thick white border
    And the multiplier bar's fill is anchored to the bar's left edge
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier bar reset to full, exactly 300, at the moment of that commit's completion
    And the score has strictly increased since it was recorded
    When the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    Then the multiplier bar has a thick white border
