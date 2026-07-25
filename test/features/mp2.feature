Feature: The multiplayer lobby creates and joins sessions by a shared code (MP2)
  As a player who chose Multiplayer
  I want to create or join a session with another player, by a code
  So we can both get ready to play together

  @E1
  Scenario: The lobby prompts for a name, then offers a keyboard-operable Generate/Enter choice
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    When I choose "Multiplayer" from the start screen
    Then the multiplayer lobby's name entry step is shown
    When I type "Alice" into the lobby name field
    And I press "Enter"
    Then the lobby's "Generate code" option is highlighted as selected
    When I press "ArrowDown"
    Then the lobby's "Enter code" option is highlighted as selected
    When I press "ArrowUp"
    Then the lobby's "Generate code" option is highlighted as selected

  # E2/E3 open over a real local server rather than file:// (MP2-STORE): the
  # real REST client's fetch() calls are rejected outright for file:// pages
  # before any request is even attempted, unlike E1 above, which never
  # confirms a choice and so never touches the network.
  @E2
  Scenario: Generate code creates a session, shows a random 10-letter code, and waits
    Given I open the game over a real local server, at the raw start screen, with no mode chosen yet
    When I choose "Multiplayer" from the start screen
    And I type "Alice" into the lobby name field
    And I press "Enter"
    And I press "Enter"
    Then a random 10-letter code is displayed
    And the lobby shows it is waiting for a second player

  @E3
  Scenario: Enter code lets the player type a code via keyboard and attempt to join
    Given I open the game over a real local server, at the raw start screen, with no mode chosen yet
    When I choose "Multiplayer" from the start screen
    And I type "Bob" into the lobby name field
    And I press "Enter"
    And I press "ArrowDown"
    And I press "Enter"
    Then the lobby's code entry step is shown
    When I type "NOSUCHCODE" into the lobby code field
    And I press "Enter"
    Then the lobby reports the code was not found

  # E4 (the host's own screen registers/acknowledges a joining second player),
  # E5 (each player sees the other's real, exchanged name), and E6 (the whole
  # flow is a genuine round trip through the stub, not narrated or hardcoded)
  # all describe the SAME single round trip from two separate pages - not
  # meaningfully separable into their own atomic scenarios without either
  # faking one side of that round trip or duplicating E8 three times. Proven
  # together, for real, as E8 below.

  @E7
  Scenario: Single-player and the start screen are unchanged by the multiplayer lobby
    Given I open "index.html" at the raw start screen, with no mode chosen yet
    Then the start screen offers "Single-player" and "Multiplayer" in the pixel font
    When I choose "Single-player" from the start screen
    Then the game board is shown
  # The full single-player play loop itself is already proven by mp1.feature's
  # own E2/E4 and game-match-loop.feature - not re-derived here.

  @E8 @integration
  Scenario: Two independent pages create and join a session, then both see each other's real name and reach ready
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then both pages reach the ready state showing "Alice & Bob"

  # E9 (a corrupted stored session reads as not-found, not a crash) is retired
  # here (MP2-STORE): it targeted the localStorage-backed stub specifically,
  # which the real server-backed session service has now fully replaced - the
  # client no longer reads session state from this browser's own storage at
  # all, so "corrupt localStorage" no longer corresponds to any real failure
  # mode. The equivalent robustness claim for the real store - a genuinely
  # unavailable/misconfigured backend surfaces a clear error rather than
  # hanging - is mp2-store.feature's own E4.
