Feature: Each player fully controls their own side of the match (MP3-FIX)
  As two players in a match
  I want my own controls, audio, autoplay, and exit confirmation to work independently
  So playing my side never depends on or affects the other player

  # E1: this is the regression this whole behaviour exists to fix - MP3's own
  # E6 only ever proved the HOST (the first page) could play; the joiner (the
  # second page) was never exercised and turned out not to work live.
  @E1
  Scenario: The joining player can play their own grid, not just the host
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I record the first page's remote match board
    And I locate an adjacent swap that would produce a match on the second page's local match board
    When I commit that swap on the second page's local match board
    Then the second page's local match score has increased
    And the first page's remote match board is unchanged from the recorded one

  @E2
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

  @E3
  Scenario: S toggles only the local player's own audio
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    And audio is unmuted on both pages
    When I press "s" on the second page
    Then audio is muted on the second page
    And audio is unmuted on the first page

  @E4
  Scenario: A toggles only the local player's own autoplay
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    And autoplay is off on both pages
    When I press "a" on the first page
    Then autoplay is on on the first page
    And autoplay is off on the second page

  @E5
  Scenario: ESC opens the exit overlay for one player only, and Y exits just that player's match
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
    When I press "Escape" on the second page
    And I press "y" on the second page
    Then the second page is back at the start screen
    And the first page is still in the match

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
