Feature: The remote-opponent view stays accurate under sustained rapid play (MP4-FIX)
  As two players in a match
  I want my opponent's remote view to stay accurate even while they play quickly
  So the match never shows a stale, wrong, or frozen picture of what's really happening

  # Owner report (live, two real browsers, one player autoplaying): the
  # remote replica's board diverged from the opponent's real board, and its
  # score fell behind then froze solid while the opponent's real score kept
  # climbing. Every existing mp4/mp5 scenario only ever commits ONE swap and
  # waits for it to fully settle before doing anything else - never
  # exercising a SUSTAINED burst of moves, which is exactly the condition
  # that exposed this. SPEC 13.4.0 (re-frozen): the remote view must never
  # diverge or freeze, only lag briefly.
  @E1 @E2 @E3 @E4 @E7 @integration
  Scenario: The remote replica keeps pace with a sustained burst of autoplay moves, and settles to an exact match once play pauses
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    When I press "a" on the first page
    Then the second page's remote match score never permanently freezes while the first page's own local score keeps climbing, over several seconds of sustained play
    When I press "a" on the first page
    And the second page's remote match board and score eventually reflect the first page's own local board and score
