Feature: Navigate & select (B2)
  As a player before any swap happens
  I want to move a cursor, select a gem, and aim a swap target with the keyboard
  So that I can set up a move without ever risking the board's contents

  @E1
  Scenario: On load, exactly one cell shows the cursor highlight
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the cursor highlight is at cell 0,0
    And no selection or target highlight is present

  @E2
  Scenario: An arrow key moves the cursor exactly one cell in that direction
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "ArrowRight"
    Then the cursor highlight is at cell 0,1
    When I press "ArrowDown"
    Then the cursor highlight is at cell 1,1

  @E3
  Scenario: An arrow key off the edge of the grid leaves the cursor exactly where it was
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "ArrowUp"
    Then the cursor highlight is at cell 0,0
    When I press "ArrowLeft"
    Then the cursor highlight is at cell 0,0

  @E4
  Scenario: SPACE selects the gem under the cursor with a distinct highlight
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Space"
    Then the selection highlight is at cell 0,0
    And the selection highlight colour is distinct from the cursor highlight colour

  @E5
  Scenario: An arrow key after selecting designates an adjacent target with a distinct highlight
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Space"
    And I press "ArrowRight"
    Then the target highlight is at cell 0,1
    And the target highlight colour is distinct from both the cursor and selection highlight colours

  @E6
  Scenario: An arrow key off the edge while selected designates no target
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Space"
    And I press "ArrowUp"
    Then no target highlight is present
    And the selection highlight is at cell 0,0

  @E7
  Scenario: A further arrow key never moves the target away from being adjacent to the selection
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Space"
    And I press "ArrowRight"
    And I press "ArrowUp"
    Then the target highlight is at cell 0,1
    And the selection highlight is at cell 0,0
    When I press "ArrowDown"
    Then the target highlight is at cell 1,0
    And the selection highlight is at cell 0,0

  @E8
  Scenario: ESC clears any active selection and target back to the plain cursor
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Space"
    And I press "ArrowRight"
    And I press "Escape"
    Then the cursor highlight is at cell 0,0
    And no selection or target highlight is present

  @E9
  Scenario: No interaction in this behaviour ever mutates the board's gems
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I record the classified gem grid
    When I press "ArrowRight"
    And I press "ArrowDown"
    And I press "Space"
    And I press "ArrowLeft"
    And I press "Escape"
    And I press "Space"
    And I press "ArrowUp"
    Then the classified gem grid is unchanged from the recorded one

  @E10
  Scenario: One continuous session walks cursor -> selection -> target -> cancel -> selection -> target
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I record the classified gem grid
    When I press "ArrowRight"
    And I press "ArrowRight"
    And I press "ArrowDown"
    And I press "ArrowUp"
    And I press "ArrowUp"
    Then the classified gem grid is unchanged from the recorded one
    When I press "Space"
    Then the selection highlight is at cell 0,2
    When I press "ArrowRight"
    Then the target highlight is at cell 0,3
    And the target highlight colour is distinct from both the cursor and selection highlight colours
    When I press "Escape"
    Then the cursor highlight is at cell 0,2
    And no selection or target highlight is present
    When I press "Space"
    Then the selection highlight is at cell 0,2
    When I press "ArrowDown"
    Then the target highlight is at cell 1,2
    Then the classified gem grid is unchanged from the recorded one
