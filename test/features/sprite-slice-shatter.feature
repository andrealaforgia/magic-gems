Feature: Sprite-slice shatter (SG3)
  As a player
  I want a matched gem to visibly break into pieces of its own sprite art
  So that the break reads as that specific jewel shattering, not a generic effect

  @E1
  Scenario: Matched gems shatter into real crops of their own sprite art, not a flat colour
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then multiple fragments are actively animating
    And every active fragment carries a real crop of the cleared gem's own sprite image, not a flat colour

  # E2 (pieces fall, drift, and vanish past the lower edge) is the pre-existing B4
  # shatter physics (gem-shatter.feature @E2/@E3/@E4) - unaffected by this
  # behaviour, which changes only what gets drawn on each fragment, not how it
  # moves. E3 (varied break from clear to clear) is gem-shatter.feature's own @E5
  # (different fragment velocity patterns between two shatters) - same reasoning.
  # E4 (only matched gems shatter, fallen/refilled ones don't) is B4r's @E1/@E2.
  # E5 (slow, deliberate pace) is B4r's @E3/@E4. E6 (spin and play unaffected) is
  # every pre-existing sprite-reskin/idle-spin/board/game/shatter scenario, all
  # still green against this change. None re-derived here.

  @E7 @integration
  Scenario: A full fresh-load play cycle completes correctly with real sprite-slice shatter throughout
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then all 64 cells contain exactly one recognizable gem colour each
    Given I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then multiple fragments are actively animating
    And every active fragment carries a real crop of the cleared gem's own sprite image, not a flat colour
    When the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
    And the gem at cell 0,0 shows a different rotation frame after a short real interval
