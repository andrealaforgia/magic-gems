Feature: A redundant SPACE does not cancel the current selection (FIX-SELECT)
  As a player
  I want pressing SPACE again on an already-selected gem to do nothing
  So that I don't lose my selection by an extra keypress

  @E1
  Scenario: A second SPACE with no target designated leaves the selection unchanged
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Space"
    And I press "Space"
    Then the selection highlight is at cell 0,0

  @E2
  Scenario: Repeated redundant SPACE presses never cancel the selection
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Space"
    And I press "Space"
    And I press "Space"
    And I press "Space"
    Then the selection highlight is at cell 0,0

  @E3
  Scenario: A redundant SPACE does not stop ESC from cancelling the selection afterward
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "Space"
    And I press "Space"
    And I press "Escape"
    Then no selection or target highlight is present

  # E4 (the normal select -> target -> commit flow is unaffected) is already proven
  # by game-match-loop.feature's own commit/revert scenarios, all still green with
  # this fix in place. Not re-derived here.

  @E5 @integration
  Scenario: Pressing SPACE redundantly does not disrupt committing a real swap afterward
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap, pressing SPACE redundantly a few times right after selecting
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
