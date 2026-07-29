Feature: Ordered, gap-recovering opponent sync (MP-SEQ-ORDER, slice 2 of 4 of MP-SYNC-SEQUENCED)
  As two players in a match
  I want my opponent's updates applied in the order they were sent, with no gap freezing the view
  So the remote grid is never shown out of sequence, and a lost update never leaves it stuck

  Background:
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I record the first page's own sent snapshot payloads
    And I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the second page's remote match board and score eventually reflect the first page's own local board and score

  # SPEC 13.4.1: an update arriving before its predecessor is HELD until the
  # gap fills, never applied out of arrival order. Deliberately engineers the
  # exact defect this section exists to prevent - sequence 2 delivered before
  # sequence 1 - by injecting real, hand-crafted requests directly against
  # this same live match's own session, over the same real wire the client's
  # own genuine sends already used above.
  @E1 @E2 @E8 @integration
  Scenario: A deliberately out-of-order update is held, never applied ahead of its predecessor, and drains once the gap fills
    Given I record the second page's own remote board and score
    When the first page injects a crafted snapshot with sequence 2, board fill "green-octagon", and score 500
    Then the second page's remote match board and score stay unchanged from what was recorded, for a sustained period
    When the first page injects a crafted snapshot with sequence 1, board fill "purple-triangle", and score 300
    Then the second page's remote match board and score eventually show board fill "green-octagon" and score 500

  # SPEC 13.4.2/13.4.4: a missing update must never freeze the opponent's
  # grid - deliberately DROPS sequence 1 and 2 outright (never sent at all)
  # and proves the bounded-wait skip-ahead recovers to the newest available
  # update directly, silently, with local play on the sending side unaffected.
  @E3 @E4 @E9 @integration
  Scenario: A dropped update recovers silently via bounded-wait skip-ahead, without freezing local play or surfacing an error
    When the first page injects a crafted snapshot with sequence 3, board fill "yellow-diamond", and score 900
    Then the second page's remote match board and score eventually show board fill "yellow-diamond" and score 900
    And no error or failure state is shown on either page
    Then the first page can still make a fresh move that increases its own local score
