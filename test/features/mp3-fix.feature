Feature: Each player fully controls their own side of the match (MP3-FIX)
  As two players in a match
  I want my own controls, audio, autoplay, and exit confirmation to work independently
  So playing my side never depends on or affects the other player

  # E1: this is the regression this whole behaviour exists to fix - MP3's own
  # E6 only ever proved the HOST (the first page) could play; the joiner (the
  # second page) was never exercised and turned out not to work live.
  @E1 @integration
  Scenario: The joining player can play their own grid, not just the host
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I locate an adjacent swap that would produce a match on the second page's local match board
    When I commit that swap on the second page's local match board
    Then the second page's local match score has increased

  @E2 @integration
  Scenario: Score and its multiplier are independent per player, not shared
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    And the first page's own match multiplier bar is shown, in the pixel font
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the second page's own local match score is still exactly zero

  @E3 @integration
  Scenario: S toggles only the local player's own audio
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    And audio is unmuted on both pages
    When I press "s" on the second page
    Then audio is muted on the second page
    And audio is unmuted on the first page

  @E4 @integration
  Scenario: A toggles only the local player's own autoplay
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    And autoplay is off on both pages
    When I press "a" on the first page
    Then autoplay is on on the first page
    And autoplay is off on the second page

  # AUTOPLAY-PACE2X (SPEC 12.2 re-frozen again) E5: the brisk-pace fix must
  # hold in a real match too, not just single-player - both share the same
  # tuning constants, but this proves it live rather than by inference.
  @E4 @integration
  Scenario: Autoplay in a real match also runs at the new brisk, watchable pace and only ever commits valid matches
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    When I press "a" on the first page
    Then the first page's own match autoplay is clearly brisk but still watchable, and every committed swap actually matches, over several real moves

  @E5 @integration
  Scenario: ESC opens the exit overlay for one player only, and N resumes just that player's own match
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    When I press "Escape" on the second page
    Then the second page's match exit overlay is shown
    And the first page's match exit overlay is not shown
    When I press "n" on the second page
    Then the second page's match exit overlay is not shown
    And the second page is still in the match
  # Confirming with Y is now a SURRENDER (SPEC 13.5.1) - it ends the match on
  # BOTH clients, with the opponent correctly proclaimed the winner, not just
  # a plain per-player exit. That more precise claim, including the correct
  # winner/loser on each side, is mp5.feature's own dedicated coverage.

  # AUTOPLAY-INVALID-MOVE E1/E2/E4/E6: the same stale-input-state defect the
  # single-player driver had, on the match grid instead - the fix (commit
  # 0099550) applies the identical guard to both drivers. Proven here live,
  # against the first known trigger, repeated across many cycles.
  @E4 @integration
  Scenario: Selecting a gem by hand and then switching autoplay on never produces an invalid swap in a real match, across many repeated cycles
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Then repeatedly selecting a gem by hand before switching autoplay on never produces an invalid swap on the first page's own match, across many cycles

  # AUTOPLAY-INVALID-MOVE E1/E3/E4/E6: the second known trigger, on the match
  # grid.
  @E4 @integration
  Scenario: Toggling autoplay off mid-plan and back on never produces an invalid swap in a real match, across many repeated cycles
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Then repeatedly toggling autoplay off mid-plan and back on never produces an invalid swap on the first page's own match, across many cycles

  # AUTOPLAY-RANDOM-CHOICE (SPEC 12.5) E4/E6: both clients build the
  # IDENTICAL starting board from the shared session code (13.3.1) - if
  # autoplay's own move choice were deterministic, two clients autoplaying
  # from that same board would make the exact same moves in the exact same
  # order. Proves the opposite: each side's own randomly-chosen moves
  # diverge from the other's.
  @E4 @integration
  Scenario: Two clients autoplaying from the identical starting board make different move choices
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    When I press "a" on the first page
    And I press "a" on the second page
    Then both pages' own autoplay move choices diverge from each other, over several real moves

  @E6 @E7 @integration
  Scenario: The countdown and gauge remain visible throughout, on both real clients
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    And the first page's match timer reads 10:00 or just under, in the pixel font
    And the second page's match timer reads 10:00 or just under, in the pixel font
    And the first page's match gauge is evenly split at the start
    And the second page's match gauge is evenly split at the start
