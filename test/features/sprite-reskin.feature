Feature: Sprite re-skin, static (SG1)
  As a player
  I want the gems to look like glossy, faceted gemstone sprites instead of flat
  neon-glowing vector shapes
  So that the board reads as a polished, believable set of jewels

  @E1 @E7
  Scenario: Every gem identity renders from its real rotation-frame sprites, not a vector shape
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then each of the seven gem identities is backed by its own full set of real rotation-frame sprite images
    And all 64 cells contain exactly one recognizable gem colour each

  # E1's "centred within its cell on both axes" and "scaling up/down with the
  # board" (SPEC 3.3, 3.4) are proven exhaustively at the unit level instead of by
  # pixel-probing raster art: test/unit/sprite-layout.test.js exercises
  # computeSpriteDrawRect (the pure function that places every sprite) across many
  # cell sizes and sprite aspect ratios, and test/unit/render.test.js proves
  # drawGem/drawBoard actually use that function's output via ctx.drawImage. A
  # raster sprite's own artwork isn't necessarily symmetric inside its PNG canvas,
  # so scanning rendered pixels for a symmetric alpha bounding box (the old vector
  # approach) would neither prove nor disprove real centring here.
  #
  # E3's "no neon-glow effect remains on gem rendering" is likewise proven at the
  # unit level: test/unit/render.test.js's ctx-spy asserts drawGem never sets
  # shadowBlur/shadowColor - a stronger guarantee than a luma-fade heuristic, since
  # it inspects the actual draw calls rather than inferring intent from pixels.

  @E2 @E3
  Scenario: The board's gem identities are exactly the seven sprite gems, holding across a reload and a forced reshuffle
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the board's 64 cells show gem colours that map to all seven known gem types
    When I open "index.html" again as a fresh file:// page load
    Then the board's 64 cells show gem colours that map to all seven known gem types
    When I apply the live page's own ensurePlayable to a known stuck board
    Then the reshuffled result's cells are all one of the seven sprite gem identities, never a retired one

  # E4 (no pre-existing match on a fresh load), E5 (a valid swap clears/gravity/
  # refills/cascades; an invalid swap reverts) and E6 (auto-reshuffle guarantees a
  # move) are the pre-existing B1/B3 guarantees (board-renders.feature @E6,
  # game-match-loop.feature @E1/@E2/@E4/@E5/@E7/@E8/@E10) - unmodified by this
  # re-skin, and already exercising the seven sprite identities transparently now
  # that classifiedGrid (test/features/support/board-reader.js) classifies real
  # rendered sprite pixels instead of a flat colour palette. Not re-asserted here
  # to avoid re-deriving the same claims a second, fragile way.

  @E8 @integration
  Scenario: A full fresh-load play cycle with the seven sprite gems completes end to end
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then all 64 cells contain exactly one recognizable gem colour each
    And the board contains no horizontal or vertical run of 3 or more identical gems
    And the board's 64 cells show gem colours that map to all seven known gem types
    Given I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    And all 64 cells contain exactly one recognizable gem colour each
