Feature: The start screen is fully keyboard-operable (MP1-KEYS)
  As a player
  I want to pick a mode using only the keyboard
  So that the game stays consistent with its keyboard-only controls

  @E1
  Scenario: Single-player is highlighted by default, and arrow keys move the selection
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    Then "Single-player" is highlighted as selected
    When I press "ArrowDown"
    Then "Multiplayer" is highlighted as selected
    When I press "ArrowUp"
    Then "Single-player" is highlighted as selected

  @E2 @E4 @e2e
  Scenario: SPACE confirms the highlighted Single-player choice
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    When I press "Space"
    Then the game board is shown

  @E3 @E4
  Scenario: ENTER confirms the highlighted Multiplayer choice
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    When I press "ArrowDown"
    And I press "Enter"
    Then the multiplayer placeholder screen is shown

  @E3
  Scenario: ENTER also confirms Single-player, equivalently to SPACE
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    When I press "Enter"
    Then the game board is shown

  @E5
  Scenario: Single-player reached via keyboard is still fully playable, no regression from MP1
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    When I press "Space"
    Then the game board is shown
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each

  @E6 @integration
  Scenario: A full fresh-load play cycle, driven entirely by keyboard, no mouse at all
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    Then "Single-player" is highlighted as selected
    When I press "ArrowDown"
    Then "Multiplayer" is highlighted as selected
    When I press "ArrowUp"
    Then "Single-player" is highlighted as selected
    When I press "Space"
    Then the game board is shown
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems

  # A separate fresh load confirming Multiplayer via keyboard (E6's other half)
  # is the "ENTER confirms the highlighted Multiplayer choice" scenario above -
  # not re-derived here.
