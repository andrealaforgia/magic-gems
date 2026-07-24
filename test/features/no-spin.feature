Feature: Gems rest completely still (SG-NOSPIN)
  As a player
  I want resting gems to hold a single, fixed view
  So that the board reads as a calm, static picture rather than a shimmering one

  @E1
  Scenario: A resting gem shows the exact same frame every time, never advancing
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the gem at cell 0,0 shows an identical appearance across repeated samples over a real interval

  @E2
  Scenario: No cell anywhere on a resting board ever changes appearance
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then every cell on the board shows an identical appearance across repeated samples over a real interval

  # E3 (seven sprite identities, correct centring/scaling, no pre-existing match,
  # and all play - swap with revert, gravity, refill, cascade, auto-reshuffle) is
  # the pre-existing sprite-reskin/board/game suite - unmodified by this behaviour,
  # which only removes the now-retired idle-rotation render path. Not re-derived
  # here.

  # E4 (matched gems still shatter into real pieces of their own sprite art that
  # fall, drift, and vanish) is sprite-slice-shatter.feature's own @E1 - unaffected,
  # since idle rotation and shatter were always independent effects. Not re-derived
  # here.

  @E5 @integration
  Scenario: A full fresh-load play cycle completes correctly with gems staying completely static at rest
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then all 64 cells contain exactly one recognizable gem colour each
    And every cell on the board shows an identical appearance across repeated samples over a real interval
    Given I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
    And every cell on the board shows an identical appearance across repeated samples over a real interval
