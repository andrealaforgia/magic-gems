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

  # SPEC 13.4.5.2/E2 (corrected): the sync interval and the ordering
  # machinery's own coalescing/skip-ahead recovery can each legitimately
  # fold several of the opponent's real, single-cell moves into one applied
  # update - so arriving at the right cell is not enough; a watcher must see
  # the cursor actually PASS THROUGH the intermediate cells in between, not
  # teleport. Three real key presses along one axis are deliberately used so
  # the intermediate cell is unambiguous, and the remote canvas is sampled
  # repeatedly WHILE the move happens (not just checked once at the end) to
  # tell real travel apart from a direct jump to the destination.
  @E2 @integration
  Scenario: The opponent's cursor is observed travelling through an intermediate cell, not jumping straight to its destination
    Given the second page's remote cursor highlight eventually is at cell 0,0
    And I record the second page's own remote cursor trail
    When I press "ArrowRight" on the first page
    And I press "ArrowRight" on the first page
    And I press "ArrowRight" on the first page
    Then the second page's own remote cursor trail eventually shows cell 0,3 as the resting position, having passed through cell 0,1 along the way

  # Owner extension to E2 (on top of the frozen SPEC 13.4.5.2, not a
  # reinterpretation of it): the TRUE path actually taken must be reproduced,
  # corners and all - not merely SOME path between the two endpoints. A
  # row-first reconstruction between (0,0) and (2,2) would visit (1,0) then
  # (2,0) then (2,1) - never (0,2) or (1,2) at all. The real move here goes
  # right, right, down, down, so a faithful replay visits (0,2) BEFORE (1,2);
  # a reconstructed shortcut would show neither, in either order.
  @E2 @integration
  Scenario: The opponent's true L-shaped path is reproduced exactly, not straightened into a shortcut between its endpoints
    Given the second page's remote cursor highlight eventually is at cell 0,0
    And I record the second page's own remote cursor trail
    When I press "ArrowRight" on the first page
    And I press "ArrowRight" on the first page
    And I press "ArrowDown" on the first page
    And I press "ArrowDown" on the first page
    Then the second page's own remote cursor trail eventually shows cell 2,2 as the resting position, having passed through cell 0,2 then cell 1,2 along the way

  # Owner extension to E2: not just the path but the FEEL of it - a slow move
  # must look slow, a quick flick must look quick, never normalized to the
  # same on-screen cadence. A real 700ms pause is inserted before the second
  # half of the move (a genuine slow segment); the first half has no pause at
  # all (as fast as two real key presses can happen). Both halves cover the
  # same one-cell distance, so only real recorded pace - never distance -
  # can explain a difference.
  @E2 @integration
  Scenario: A slow move and a fast move over the same distance are visibly distinguishable in pace on the remote grid
    Given the second page's remote cursor highlight eventually is at cell 0,0
    And I record the second page's own remote cursor trail
    When I press "ArrowRight" on the first page
    And I press "ArrowRight" on the first page
    And I press "ArrowDown" on the first page
    And I wait 700ms before continuing on the first page
    And I press "ArrowDown" on the first page
    Then the second page's own remote cursor trail shows the move from cell 1,2 to cell 2,2 taking meaningfully longer than the move from cell 0,1 to cell 0,2

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

  # E7 (integration, critical), cursor half: a real live two-player match
  # shows the opponent's cursor visibly TRAVELLING (not teleporting - the
  # same corrected E2 bar) on the remote grid, in both directions, so neither
  # side is a special case. Kept separate from the selection/target half
  # below (QA review, Farley Index/Granular) so a red build points at
  # exactly which behaviour broke.
  @E7 @integration
  Scenario: Both directions of a live match show the opponent's real cursor travelling on the remote grid
    Given the second page's remote cursor highlight eventually is at cell 0,0
    And I record the second page's own remote cursor trail
    When I press "ArrowDown" on the first page
    And I press "ArrowDown" on the first page
    Then the second page's own remote cursor trail eventually shows cell 2,0 as the resting position, having passed through cell 1,0 along the way
    Given the first page's remote cursor highlight eventually is at cell 0,0
    And I record the first page's own remote cursor trail
    When I press "ArrowRight" on the second page
    And I press "ArrowRight" on the second page
    Then the first page's own remote cursor trail eventually shows cell 0,2 as the resting position, having passed through cell 0,1 along the way

  # E7 (integration, critical), selection/target half: the same live match
  # shows the opponent's selection and designated target highlighting on the
  # remote grid, in both directions, with the identical highlight treatment
  # the local player's own selection/target use.
  @E7 @integration
  Scenario: Both directions of a live match show the opponent's real selection and target moving on the remote grid
    When I press "ArrowRight" on the first page
    And I press "Space" on the first page
    And I press "ArrowRight" on the first page
    Then the second page's remote selection highlight eventually is at cell 0,1
    And the second page's remote target highlight eventually is at cell 0,2
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
