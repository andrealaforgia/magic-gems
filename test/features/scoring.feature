Feature: Scoring system (SCORE)
  As a player
  I want a running score that rewards fast, big, and chained clears
  So that I have a sense of progress and skillful play

  @E1
  Scenario: The score starts at 0 and only ever increases over play
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the score is displayed and reads exactly 0
    And the time multiplier is displayed and reads exactly x5000
    Given I record the current score
    When I commit 3 matching swaps in a row, each settling before the next
    Then the score has not decreased since it was recorded

  @E2
  Scenario Outline: Base points scale with run length as (run length - 2) x 50
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then a real completion of a <length>-run on the live page contributes exactly <basePoints> base points before any multiplier

    Examples:
      | length | basePoints |
      | 3      | 50         |
      | 4      | 100        |
      | 5      | 150        |

  @E3
  Scenario: Two runs clearing together sum their base points before any multiplier
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then a real completion clearing a 3-run and a 4-run together on the live page sums to exactly 150 base points

  @E4
  Scenario: The time multiplier counts down by 1 per elapsed second, floored at 0, and resets after each completion
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the live page's time multiplier for a 30s gap reads exactly 4970
    And the live page's time multiplier for a 5000s gap reads exactly 0
    And the live page's time multiplier for a 6000s gap reads exactly 0
    And the time multiplier reads lower after a short real interval, live and continuously
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier reset to x5000 at the moment of that commit's completion

  @E5
  Scenario: The combo factor follows 2^(k-1) within a chain and resets to x1 on each new swap
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the live page's combo factor for chain position 1 reads exactly 1
    And the live page's combo factor for chain position 2 reads exactly 2
    And the live page's combo factor for chain position 3 reads exactly 4
    And the live page's combo factor for chain position 4 reads exactly 8

  @E6
  Scenario: Both frozen worked examples reproduce exactly
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the live page reproduces the frozen worked example: a lone 3-run, 30s gap, scores exactly 2485
    And the live page reproduces the frozen worked example: a 3-run and 4-run together, 30s gap, first in chain, scores exactly 7455

  # E8 (scoring is purely additive; endless play, and all previously-delivered play
  # - swap with revert-on-no-match, gravity, refill, cascade, auto-reshuffle -
  # continues to work) is every pre-existing sprite-reskin/board/game/shatter/no-spin
  # scenario, all still green with scoring now active. Not re-derived here.

  @E9 @integration
  Scenario: A full fresh-load play cycle completes correctly with real scoring throughout
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the score is displayed and reads exactly 0
    And the time multiplier is displayed and reads exactly x5000
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the time multiplier reset to x5000 at the moment of that commit's completion
    And the score has strictly increased since it was recorded
    When the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
