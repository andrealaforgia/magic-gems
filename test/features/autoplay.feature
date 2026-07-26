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

  # AUTOPLAY-SLOW (SPEC 12.2 re-frozen, supersedes AUTOPLAY-SPEED entirely):
  # the Owner wants to watch autoplay and visually confirm every swap is a
  # legal 3+ match, so the emulated actions now run at a SLOW, clearly-
  # watchable pace instead of a brisk one.
  @E3 @E4 @e2e
  Scenario: Autoplay genuinely plays a full move, at a slow and watchable pace
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I record the classified gem grid
    When I press "a"
    Then autoplay is on
    And the board settles into a new, match-free arrangement within a generous real timeout
    And the classified gem grid has changed from the one recorded before, within a generous real timeout
    And autoplay's own key presses are clearly slow and watchable, with a real pause between every one

  @E10 @e2e
  Scenario: The resulting swap, shatter, and fall are not sped up during autoplay
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "a"
    Then autoplay is on
    And the resulting swap, shatter, and fall play at the normal deliberate pace, not sped up

  @E3 @e2e
  Scenario: Autoplay stays coherent across multiple cycles at the slow pace
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "a"
    Then autoplay is on
    And the score strictly increases across at least 3 separate real completions within a generous timeout
    And the board settles into a new, match-free arrangement within a generous real timeout

  # Owner report/AUTOPLAY-FIX: "it sometimes completes rows randomly" - every
  # other scenario in this file only samples the board/score at a few
  # points, which could pass even if an occasional swap in between didn't
  # actually match. This checks the complete real record of every swap
  # autoplay commits across an extended run, on a live client - not a
  # sample.
  @E1 @E4 @integration
  Scenario: Every single swap autoplay commits, across an extended real run, actually produces a match
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "a"
    Then autoplay is on
    And every autoplay-committed swap actually matches - no invalid swap sound plays, across an extended real run

  # AUTOPLAY-LEGALITY (RE-OPEN): the Owner, watching move-by-move at the new
  # slow pace, still occasionally saw gems clear as if a swap had matched
  # when it hadn't - despite the check above (pure logic + a sound cue)
  # showing zero failures. Root cause: lingering shatter fragments from an
  # EARLIER match, still visibly falling, overlapping the NEXT move's own
  # animation. This checks the actual RENDERED PIXELS the Owner watches, not
  # just the internal logic, across an extended live run.
  @E11 @integration
  Scenario: The rendered board never disagrees with the logical board, across an extended real autoplay run
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "a"
    Then autoplay is on
    And gems only ever visually clear at cells that form a real 3+ line, checked against the rendered pixels, across an extended real run

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
  Scenario: A full fresh-load play cycle shows the hint, rips through multiple cycles with feedback, then returns control cleanly
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the autoplay instruction line reads "A — TOGGLE AUTOPLAY" in the pixel font, below the grid
    And the score is displayed and reads exactly 0
    When I press "a"
    Then the autoplay indicator reads "Autoplaying..." above the score, blinking, in the pixel font
    And the score strictly increases across at least 3 separate real completions within a generous timeout
    And the board settles into a new, match-free arrangement within a generous real timeout
    When I press "a"
    Then the autoplay indicator is hidden
    And autoplay is off
    Given I record the cursor position
    When I press "ArrowRight"
    Then the cursor has moved exactly one step right of the position recorded before
