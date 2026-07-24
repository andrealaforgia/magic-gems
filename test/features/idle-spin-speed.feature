Feature: Idle-spin speed refinement (SG2-SPEED)
  As a player
  I want resting gems to turn at a lively, energetic pace
  So that the board feels alive rather than drifting too slowly to notice

  @E1
  Scenario: A resting gem completes one full rotation roughly every 1.5 seconds
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the gem at cell 0,0 completes roughly one full rotation every 1.5 seconds

  # E2 (continuous, no freeze, no jump at the wraparound) and E3 (gems out of phase
  # with one another) are unchanged claims, still proven by idle-spin.feature's own
  # E1/E3 scenarios - only the pace constant moved, not the continuity/phase logic,
  # so those scenarios now exercise the new pace automatically without needing their
  # own copy here. E4 (seven identities, centring/scaling, and all play - swap,
  # revert, gravity, refill, cascade, auto-reshuffle - still correct) is every
  # pre-existing sprite-reskin/idle-spin/board/game/shatter scenario, all still green
  # at the new pace. Not re-derived here.

  @E5 @integration
  Scenario: A full fresh-load play cycle completes correctly with gems spinning at the new lively pace
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then all 64 cells contain exactly one recognizable gem colour each
    And the gem at cell 0,0 completes roughly one full rotation every 1.5 seconds
    Given I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
    And the gem at cell 0,0 completes roughly one full rotation every 1.5 seconds
