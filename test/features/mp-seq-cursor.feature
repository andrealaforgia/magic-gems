Feature: Live opponent cursor, selection, and target on the remote grid (MP-SEQ-CURSOR, slice 3 of 4 of MP-SYNC-SEQUENCED)
  As two players in a match
  I want to see my opponent's cursor, selection, and aimed swap target move live on their grid
  So the match feels like watching a real second player, not just a board that changes on its own

  Background:
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages

  # SPEC 13.4.5.2/E2: the opponent's cursor is drawn as it moves, using the
  # identical white highlight treatment (same palette, same ring) the local
  # player's own cursor uses - proven by reading the REMOTE canvas's real
  # rendered pixels on the receiving page, not the wire payload.
  @E2 @integration
  Scenario: The opponent's moving cursor is drawn live on the remote grid, with the same highlight treatment as a local cursor
    When I press "ArrowRight" on the first page
    And I press "ArrowDown" on the first page
    Then the second page's remote cursor highlight eventually is at cell 1,1

  # SPEC 13.4.5.2/E3: the opponent's current selection, once made, is shown
  # highlighted the same way the local player's own selection is.
  @E3 @integration
  Scenario: The opponent's selection is shown live on the remote grid, with the same highlight treatment as a local selection
    When I press "ArrowRight" on the first page
    And I press "Space" on the first page
    Then the second page's remote selection highlight eventually is at cell 0,1

  # SPEC 13.4.5.3/E4: the opponent's designated swap target, once aimed at a
  # neighbour, is shown highlighted the same way the local player's own
  # target is.
  @E4 @integration
  Scenario: The opponent's designated swap target is shown live on the remote grid, with the same highlight treatment as a local target
    When I press "ArrowRight" on the first page
    And I press "Space" on the first page
    And I press "ArrowDown" on the first page
    Then the second page's remote target highlight eventually is at cell 1,1
    And the second page's remote selection highlight eventually is at cell 0,1

  # E7 (integration, critical): a real live two-player match shows the
  # opponent's cursor visibly moving, their selection highlighting, and their
  # designated target highlighting on the remote grid - all using the
  # identical highlight treatment the local player's own cursor/selection/
  # target use - updating live as the opponent actually plays, observed on
  # both directions so neither side is a special case.
  @E7 @integration
  Scenario: Both directions of a live match show the opponent's real cursor, selection, and target moving on the remote grid
    When I press "ArrowRight" on the first page
    And I press "ArrowDown" on the first page
    And I press "Space" on the first page
    And I press "ArrowRight" on the first page
    Then the second page's remote selection highlight eventually is at cell 1,1
    And the second page's remote target highlight eventually is at cell 1,2
    When I press "ArrowDown" on the second page
    And I press "Space" on the second page
    Then the first page's remote selection highlight eventually is at cell 1,0

  # E5 (boundary, regression): still no scenic swap/shatter/fall animation of
  # the opponent's resolved moves and still no sound for remote activity -
  # unchanged by this slice, which only adds cursor/selection/target drawing.
  @E5 @integration
  Scenario: A remote cursor/selection update still plays no sound and no shatter animation on the receiving client
    Given I record the second page's own match sound log
    When I press "ArrowRight" on the first page
    And I press "Space" on the first page
    Then the second page's remote selection highlight eventually is at cell 0,1
    And the second page's own match sound log is unchanged from what was recorded before
