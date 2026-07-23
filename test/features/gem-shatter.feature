Feature: Gem shatter effect (B4)
  As a player
  I want a cleared match to visibly break apart and drift away
  So that removing gems feels like an event, not an instant disappearance

  @E1
  Scenario: A matched run breaks into multiple discrete fragments at the moment of removal
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then multiple fragments are actively animating

  @E2
  Scenario: Each fragment's position visibly changes over time
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And I capture the active fragment positions
    And a brief real interval passes
    Then the fragment positions have changed since the last capture

  @E3
  Scenario: Fragment paths include lateral drift, not a perfectly straight vertical fall
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And I capture the active fragment positions
    And a brief real interval passes
    Then at least one fragment shows lateral drift since the last capture

  @E4
  Scenario: Fragments disappear once they pass beyond the lower edge of the board
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then multiple fragments are actively animating
    When the shatter animation has settled
    Then no fragments remain

  @E5
  Scenario: Two separate clears produce visibly different fragment patterns
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And I record the fragment velocity pattern
    And the shatter animation has settled
    And I locate an adjacent swap that would produce a match on the live board
    And I commit that swap
    Then the fragment velocity pattern differs from the recorded one

  @E6
  Scenario: The glow effect on remaining gems is unaffected while a shatter is playing
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then multiple fragments are actively animating
    And an unaffected gem elsewhere on the board still shows its neon glow fade

  @E7
  Scenario: The shatter effect does not block or delay resolution or the next move
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then multiple fragments are actively animating
    When I press "ArrowRight"
    And I press "Space"
    Then a selection highlight is present, proving the game accepted input immediately

  # Trimmed per QA test-design review (commit b637cf4 Farley Index 7.8, Granular
  # finding #6): the only claim here not already proven elsewhere is that input is
  # accepted *while a shatter is still in flight*, and that a second, independent
  # shatter still plays normally afterward (no lasting side effect from the
  # interleaved input). Fragment count/velocity-variation/no-block-input/board-
  # validity are each already covered atomically by E1, E5, and gem-shatter's own
  # E7, so those assertions aren't repeated here.
  @E8 @integration
  Scenario: One continuous session - input mid-shatter does not block, and a second shatter plays normally afterward
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then multiple fragments are actively animating
    When I press "ArrowRight"
    And I press "Space"
    Then a selection highlight is present, proving the game accepted input immediately
    When I press "Escape"
    And the shatter animation has settled
    And I locate an adjacent swap that would produce a match on the live board
    And I commit that swap
    Then multiple fragments are actively animating
