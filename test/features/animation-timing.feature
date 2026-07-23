Feature: Shatter scope and transition timing (B4r)
  As a player
  I want only the gems that actually match to break apart, and the swap/fall/refill
  to visibly glide into place at a deliberate pace
  So that the board's changes read as physical events I can follow, not instant snaps

  @E1 @E2
  Scenario: Shatter fragments originate only from the cells that actually matched, never from cells that only fell or refilled
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the shatter fragments originate only from the cells the live commit actually cleared

  @E3
  Scenario: The swap itself takes a noticeable, non-instant amount of time
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would not produce a match on the live board
    When I commit that swap and time how long the visual swap phase takes
    Then the visual swap phase took at least 300 ms

  @E4
  Scenario: Falling and refilling gems take a noticeable, non-instant amount of time to settle
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap and time how long the board takes to settle after the swap
    Then the board took at least 300 ms to settle after the swap

  @E5
  Scenario: The shatter effect does not begin until the swap has visibly completed
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap and watch whether fragments appear before the swap phase ends
    Then no fragments appeared before the swap phase ended

  @E7 @integration
  Scenario: Despite the slower animated pacing, five consecutive matching swaps each settle correctly with no deadlock
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I commit 5 matching swaps in a row, each settling before the next
    Then every round settled into a valid, match-free, fully-populated board

  # Trimmed per QA test-design review (commit 034b6bf, Farley Index 7.9): the
  # original version re-derived E1/E2's full origin check and duplicated
  # game-match-loop.feature's revert-on-non-match assertion, even though each
  # claim is already independently provable by an atomic scenario elsewhere. The
  # one thing none of those atomic scenarios can show - since Cucumber gives each
  # of them a fresh page load - is that a scoped-shatter commit and a later timed
  # swap commit both hold correctly back to back in the *same* session, with no
  # state (e.g. animation/commit-tracking) bleeding from one into the other. Kept
  # to exactly one representative assertion per event type for that reason.
  @E8 @integration
  Scenario: One continuous session - a scoped shatter and a timed swap each hold correctly back to back
    Given I open "index.html" directly as a file:// URL with no server or build step
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    Then the shatter fragments originate only from the cells the live commit actually cleared
    And the shatter animation has settled
    Given I locate an adjacent swap that would not produce a match on the live board
    When I commit that swap and time how long the visual swap phase takes
    Then the visual swap phase took at least 300 ms
