Feature: Live opponent sync during the match, by board snapshot (MP-SYNC-SNAPSHOT)
  As two players in a match
  I want to see my opponent's real board and score update live
  So the match feels current, and never shows an impossible or drifted board

  # E1 (whenever a player's own board settles, they send their FULL current
  # board and score) and E2/E3 (the remote grid is a direct draw of the
  # latest snapshot actually sent - never approximated, and therefore never
  # illegal) are proven together here: the remote side can only end up at
  # the EXACT same board and score as the source's real one if the source's
  # own latest settled state was faithfully sent and drawn - there is no
  # local reconstruction step where an approximation or drift could creep in.
  @E1 @E2 @E3 @E4 @integration
  Scenario: Each client's remote side eventually shows the opponent's real board and score, in both directions
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the second page's remote match board and score eventually reflect the first page's own local board and score
    Given I locate an adjacent swap that would produce a match on the second page's local match board
    When I commit that swap on the second page's local match board
    Then the second page's local match score has increased
    And the first page's remote match board and score eventually reflect the second page's own local board and score

  @E5 @integration
  Scenario: The centre gauge tilts toward whoever currently leads on score, on both clients
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the first page's own match gauge eventually shows the first page's own player leading
    And the second page's own match gauge eventually shows the first page's own player leading

  @E6 @integration
  Scenario: A slow, failing sync channel never blocks or delays local play
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given the first page's session network requests are now slow and failing
    And I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased within a normal, short amount of time

  @E8
  Scenario: Single-player and the start screen are unaffected by live opponent sync
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    Then the start screen offers "Single-player" and "Multiplayer" in the pixel font
    When I choose "Single-player" from the start screen
    Then the game board is shown
  # The full single-player play loop itself is already proven by mp1.feature's
  # own E2/E4 and game-match-loop.feature - not re-derived here.

  @E1 @E2 @E4 @E5 @E6 @integration
  Scenario: Two real clients see each other's live board/score updates and a shifting gauge, even while one client's sync channel is degraded throughout
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given the first page's session network requests are now slow
    And I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased within a normal, short amount of time
    And the second page's remote match board and score eventually reflect the first page's own local board and score
    And the first page's own match gauge eventually shows the first page's own player leading
    And the second page's own match gauge eventually shows the first page's own player leading
    Given I locate an adjacent swap that would produce a match on the second page's local match board
    When I commit that swap on the second page's local match board
    Then the second page's local match score has increased
    And the first page's remote match board and score eventually reflect the second page's own local board and score

  # E7: unlike the earlier move-replay approach, a remote update is a direct
  # board draw - no animated shatter/fall of the opponent's own moves, and no
  # sound. Proven by the RECEIVING page's own sound log staying exactly as it
  # was, even though its remote grid visibly updates.
  @E7 @integration
  Scenario: A remote board/score update plays no sound on the receiving client
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I record the second page's own match sound log
    And I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the second page's remote match board and score eventually reflect the first page's own local board and score
    And the second page's own match sound log is unchanged from what was recorded before

  # E9 (critical - this is exactly the failure mode that broke the earlier
  # move-replay approach twice): a sustained burst of real, autoplay-driven
  # moves on BOTH sides at once, including each side's own cascades - the
  # remote grid must always end up EXACTLY matching the opponent's real
  # board, never a drifted or partial one, and local play must stay smooth
  # throughout (mp4-fix.feature has its own dedicated single-direction
  # regression coverage of the sustained-burst case; this scenario adds BOTH
  # sides autoplaying at once, which that file's own scenario doesn't).
  @E9 @integration
  Scenario: A sustained burst of moves on both sides at once never desyncs either client's remote view
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    When I press "a" on the first page
    And I press "a" on the second page
    Then the second page's remote match score never permanently freezes while the first page's own local score keeps climbing, over several seconds of sustained play
    When I press "a" on the first page
    And I press "a" on the second page
    Then the second page's remote match board and score eventually reflect the first page's own local board and score
    And the first page's remote match board and score eventually reflect the second page's own local board and score
