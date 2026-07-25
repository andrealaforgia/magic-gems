Feature: A start screen offers Single-player or Multiplayer (MP1)
  As a player
  I want to choose a mode before playing
  So that multiplayer has a place to grow without disrupting single-player

  @E1
  Scenario: A fresh load shows the start screen, not the board, offering both modes
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    Then the start screen offers "Single-player" and "Multiplayer" in the pixel font
    And the game board is not shown

  @E2 @E4 @e2e
  Scenario: Choosing Single-player starts the existing game exactly as before
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    When I choose "Single-player" from the start screen
    Then the game board is shown
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each

  @E3
  Scenario: Choosing Multiplayer advances to a distinct placeholder screen, not the board
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    When I choose "Multiplayer" from the start screen
    Then the multiplayer placeholder screen is shown
    And the game board is not shown

  @E5 @integration
  Scenario: A full fresh-load play cycle: start screen first, then a fully playable single-player game
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    Then the start screen offers "Single-player" and "Multiplayer" in the pixel font
    And the game board is not shown
    When I choose "Single-player" from the start screen
    Then the game board is shown
    And the score is displayed and reads exactly 0
    Given I record the current score
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the score has strictly increased since it was recorded
    And the board contains no horizontal or vertical run of 3 or more identical gems

  # A separate fresh load choosing Multiplayer instead (E5's other half) is E3
  # above, driven through the same real start screen - not re-derived here.
