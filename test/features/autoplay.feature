Feature: A hands-off demo mode that plays the game itself (AUTOPLAY)
  As a player
  I want to watch the game play itself
  So that I can use it as a demo without touching the controls

  @E1
  Scenario: Autoplay defaults to off, and A toggles it
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then autoplay is off
    When I press "a"
    Then autoplay is on
    When I press "a"
    Then autoplay is off

  @E2
  Scenario: The autoplay instruction line sits at the bottom of the grid alongside the audio hint
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the autoplay instruction line reads "A — TOGGLE AUTOPLAY" in the pixel font, below the grid

  @E3 @E4 @e2e
  Scenario: Autoplay genuinely plays a full move at a watchable pace
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I record the classified gem grid
    When I press "a"
    Then autoplay is on
    And the board settles into a new, match-free arrangement within a generous real timeout
    And the classified gem grid differs from the recorded one
    And at least one real interval between two autoplay key presses was not instantaneous

  @E5
  Scenario: While autoplay is on, normal player input is ignored
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "a"
    Then autoplay is on
    And injecting an arrow key, SPACE, and Escape right now has no effect on the cursor or selection

  @E6
  Scenario: Pressing A again returns control to the player
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "a"
    Then autoplay is on
    When I press "a"
    Then autoplay is off
    When I press "ArrowRight"
    Then the cursor highlight is at cell 0,1

  @E7
  Scenario: A blinking "Autoplaying..." indicator shows above the score while autoplay is on
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the autoplay indicator is hidden
    When I press "a"
    Then the autoplay indicator reads "Autoplaying..." above the score, blinking, in the pixel font
    When I press "a"
    Then the autoplay indicator is hidden

  # E8 (everything else already delivered continues to work unchanged) is every
  # pre-existing sprite-reskin/scoring/board/game/shatter/no-spin/display-polish/
  # fix-select/audio/audio-toggle/bonus-tune/bar-frame/revive scenario, all still
  # green with autoplay wired in. Not re-derived here.

  @E9 @integration
  Scenario: A full fresh-load play cycle shows the hint, plays itself with feedback, then returns control cleanly
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the autoplay instruction line reads "A — TOGGLE AUTOPLAY" in the pixel font, below the grid
    And the score is displayed and reads exactly 0
    When I press "a"
    Then the autoplay indicator reads "Autoplaying..." above the score, blinking, in the pixel font
    And the board settles into a new, match-free arrangement within a generous real timeout
    Then the score reads greater than 0
    When I press "a"
    Then the autoplay indicator is hidden
    And autoplay is off
    Given I record the cursor position
    When I press "ArrowRight"
    Then the cursor has moved exactly one step right of the position recorded before
