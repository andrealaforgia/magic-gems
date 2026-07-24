Feature: Visual presentation polish (DISPLAY-POLISH)
  As a player
  I want a more polished, readable presentation
  So that the score, pace, and board read clearly at a glance

  @E1
  Scenario: The score is rendered left-aligned in the Press Start 2P pixel font
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the score is rendered in the "Press Start 2P" pixel font, left-aligned

  @E2 @component
  Scenario: The multiplier bar's fill and colour are proportional and shift through green, yellow, and red
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier bar's fill and colour are proportional and shift through green, yellow, and red at high, middle, and low values

  @E2 @e2e
  Scenario: The multiplier bar visibly fills the header on the live page
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the multiplier bar fills all the remaining width beside the score, at a generous height, and is full and green on a fresh load

  # The bar's fill visibly shrinking over a real interval (E2) is covered by
  # scoring.feature's own timing scenario, at the same already-justified real wait
  # it uses to prove the multiplier value itself ticks down (QA warning, commit
  # 3c8f3b5) - not re-derived here with a second, independent sleep.

  @E3
  Scenario: Every grid cell shows a checkerboard background, with gems still visible on top
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then every one of the 64 cells shows a checkerboard background alternating between the two shipped shades
    And all 64 cells contain exactly one recognizable gem colour each

  # E4 (seven static sprite gems, sprite-slice shatter, full scoring maths including
  # both frozen worked examples, and endless play - swap with revert-on-no-match,
  # gravity, refill, cascade, auto-reshuffle) is every pre-existing sprite-reskin/
  # scoring/board/game/shatter/no-spin scenario, all still green with this visual
  # polish applied. Not re-derived here.

  @E5 @integration
  Scenario: A full fresh-load play cycle completes correctly with the polished presentation throughout
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the score is rendered in the "Press Start 2P" pixel font, left-aligned
    And the multiplier bar fills all the remaining width beside the score, at a generous height, and is full and green on a fresh load
    And every one of the 64 cells shows a checkerboard background alternating between the two shipped shades
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier bar reset to full, exactly 5000, at the moment of that commit's completion
    And the score has strictly increased since it was recorded
    When the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
    And every one of the 64 cells shows a checkerboard background alternating between the two shipped shades
