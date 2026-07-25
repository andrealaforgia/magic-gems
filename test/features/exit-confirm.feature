Feature: ESC opens an exit confirmation before quitting (EXIT-CONFIRM)
  As a player
  I want a confirmation before ESC actually exits the game
  So that I never lose my progress to a single stray key press

  @E1
  Scenario: With a selection active, ESC still just cancels the selection - no overlay appears
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "ArrowRight"
    And I press "Space"
    Then the selection highlight is at cell 0,1
    When I press "Escape"
    Then no selection or target highlight is present
    And the exit confirmation overlay is not shown

  @E2
  Scenario: With no selection active, ESC opens the exit confirmation overlay
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then no selection or target highlight is present
    When I press "Escape"
    Then the exit confirmation overlay is shown, reading exactly "Are you sure you want to exit the game? Y/N", centred, in the pixel font

  @E3
  Scenario: While the overlay is shown, ordinary play input and the S/A toggles are all suspended
    Given I open "index.html" directly as a file:// URL with no server or build step
    Given I record the cursor position
    When I press "Escape"
    Then the exit confirmation overlay is shown, reading exactly "Are you sure you want to exit the game? Y/N", centred, in the pixel font
    When I press "ArrowRight"
    And I press "Space"
    And I press "s"
    And I press "a"
    Then the exit confirmation overlay is shown, reading exactly "Are you sure you want to exit the game? Y/N", centred, in the pixel font
    And the cursor has not moved from the position recorded before
    And audio is unmuted
    And autoplay is off

  @E4
  Scenario: Pressing Y ends the current game and returns to the start screen
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Escape"
    And I press "y"
    Then the start screen is shown again
    And the game board is not shown

  @E5
  Scenario: Pressing N dismisses the overlay and resumes play exactly as it was
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I record the classified gem grid
    And I record the current score
    When I press "ArrowRight"
    And I press "Escape"
    And I press "n"
    Then the exit confirmation overlay is not shown
    And the cursor highlight is at cell 0,1
    And the classified gem grid is unchanged from the recorded one
    And the score has not decreased since it was recorded

  # E6 (nothing else regresses: board, scoring, audio, autoplay, and the revive
  # mechanism all keep working correctly outside the exit-confirmation flow) is
  # every pre-existing scenario in game-match-loop/scoring/audio-toggle/autoplay/
  # revive.feature, all still green with exit-confirm wired in. Not re-derived
  # here.

  @E7 @integration
  Scenario: A full fresh-load cycle - dismiss the overlay and keep playing, then exit for real
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    When I choose "Single-player" from the start screen
    Then the game board is shown
    When I press "Escape"
    Then the exit confirmation overlay is shown, reading exactly "Are you sure you want to exit the game? Y/N", centred, in the pixel font
    When I press "n"
    Then the exit confirmation overlay is not shown
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    When I press "Escape"
    And I press "y"
    Then the start screen is shown again

  # (QA review, commit 280629a, Farley Index 8.3): the exit path's own teardown
  # - cancelling the old animation frame, clearing its timers, removing its
  # keydown listener - was completely unverified, so nothing proved a
  # restarted single-player session doesn't end up running as a second copy
  # alongside the fresh one it creates. Proven directly rather than inferred
  # from unrelated symptoms.
  @E9
  Scenario: Exiting and restarting single-player leaves no duplicate session running
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then exactly one single-player session is active
    When I press "Escape"
    And I press "y"
    Then the start screen is shown again
    When I choose "Single-player" from the start screen
    Then the game board is shown
    And exactly one single-player session is active
