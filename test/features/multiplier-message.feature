Feature: A message on the multiplier bar warns the player it is draining (MULTIPLIER-MESSAGE)
  As a player
  I want the multiplier box to tell me it is draining and by how much
  So that I feel the urgency without having to read a bare bar

  @E1 @e2e
  Scenario: The multiplier box shows the fixed SPEC 10.9 message, in white, with the current value after "x"
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier box shows "Score multiplier: x100" in white

  @E2 @e2e
  Scenario: The shown number keeps pace with the countdown and never disagrees with the bar's own value
    Given I open "index.html" directly as a file:// URL with no server or build step
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier bar reset to full, exactly 100, at the moment of that commit's completion
    And the multiplier message shows the number 100 right now
    And the multiplier message's number always matches the bar's own value

  @E3 @e2e
  Scenario: The message is still shown, reading x0, once the multiplier has fully drained (SPEC 10.9.2)
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier message reads "Score multiplier: x0" once the multiplier has fully drained

  @E4 @component
  Scenario: The message text is white with a legibility outline, sitting within the bar's own box, independent of fill level (SPEC 10.9.3)
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier message text is white with a contrast outline, sitting within the bar's own box

  @E5 @integration
  Scenario: A full fresh-load play cycle shows the drain message correctly through every phase
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier box shows "Score multiplier: x100" in white
    And the time multiplier bar is displayed and is full, at exactly 100
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier bar reset to full, exactly 100, at the moment of that commit's completion
    And the multiplier message shows the number 100 right now
    And the score has strictly increased since it was recorded
    When the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    # No regression to the bar's own geometry/direction/gradient/border (SPEC 10.8)
    # or to the scoring formula (SPEC 10.7) - both proven live here, not re-derived.
    And the multiplier bar's fill is anchored to the bar's left edge
    And the multiplier bar has a thick white border
    And the live page reproduces the frozen worked example: a lone 3-run, 30s gap, scores exactly 35
    And the multiplier message reads "Score multiplier: x0" once the multiplier has fully drained
