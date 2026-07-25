Feature: A player can rejoin their own session (MP-RECONNECT)
  As a player whose connection or browser tab drops mid-session
  I want to get back into the same session under my own name
  So a dropped connection doesn't lock me out of a match I'm already part of

  @E1 @E2 @E4 @integration
  Scenario: A player who left reclaims their place instead of being told the session is full, while a genuinely new third player still is
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then both pages reach the ready state showing "Alice & Bob"
    When a new page enters the lobby, types the name "Bob", and enters that same code
    Then that new page also reaches the ready state showing "Alice & Bob"
    When a new page enters the lobby, types the name "Carol", and enters that same code
    Then that new page reports the session is full

  @E3
  Scenario: Creating a fresh session and a normal join by a genuinely new name are unaffected
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Dave" and generates a code
    And the second page enters the name "Erin" and enters that same code
    Then both pages reach the ready state showing "Dave & Erin"
