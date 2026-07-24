Feature: Sound effects respond to game events (AUDIO)
  As a player
  I want short sounds to respond to what I do and what happens on the board
  So that moves, swaps, and clears feel responsive and satisfying

  @E1
  Scenario: Moving the cursor plays a distinct sound
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "ArrowRight"
    Then the sound log includes "cursor-move"

  @E1
  Scenario: Selecting a gem plays a distinct sound
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Space"
    Then the sound log includes "select"

  @E1
  Scenario: Committing a matching swap plays a swap sound, then match-clear, drop, and score sounds as it resolves
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the sound log includes "swap"
    Given the shatter animation has settled
    Then the sound log includes "shatter"
    And the sound log includes "drop"
    And the sound log includes "score"

  @E1
  Scenario: Committing a non-matching swap plays a distinct invalid/revert sound, not the swap sound
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would not produce a match on the live board
    When I commit that swap
    Then the sound log includes "invalid"
    And the sound log does not include "swap"

  @E2 @component
  Scenario: Cascade steps play an ascending tone that rises with chain depth, clamped at the top
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the live page's cascade tone for chain position 1 is tone number 1
    And the live page's cascade tone for chain position 2 is tone number 2
    And the live page's cascade tone for chain position 3 is tone number 3
    And the live page's cascade tone for chain position 4 is tone number 4
    And the live page's cascade tone for chain position 8 is still tone number 4, clamped

  @E3
  Scenario: Audio never blocks or breaks play
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then no console errors were raised while loading
    And the board contains no horizontal or vertical run of 3 or more identical gems

  @E4
  Scenario: No background music ever plays - only discrete event sounds
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then every entry in the sound log is one of the bundled discrete event sounds

  # E5 (everything already delivered continues to work with audio wired in) is every
  # pre-existing sprite-reskin/scoring/board/game/shatter/no-spin/display-polish/
  # fix-select scenario, all still green with audio wired in. Not re-derived here.

  @E6 @integration
  Scenario: A full fresh-load play cycle plays the right sounds at each step, with no background music
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "ArrowRight"
    Then the sound log includes "cursor-move"
    When I press "Space"
    Then the sound log includes "select"
    When I press "Escape"
    And I locate an adjacent swap that would produce a match on the live board
    And I commit that swap
    Then the sound log includes "swap"
    Given the shatter animation has settled
    Then the sound log includes "shatter"
    And the sound log includes "score"
    And every entry in the sound log is one of the bundled discrete event sounds
    And the board contains no horizontal or vertical run of 3 or more identical gems
