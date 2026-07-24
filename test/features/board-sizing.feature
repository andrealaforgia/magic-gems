Feature: Board sizing (B1s)
  As a player
  I want the board to use a good portion of my screen, on any reasonable viewport
  So that the gems are easy to see without the board overflowing off-screen

  @B1s-E1 @B1s-E3
  Scenario: The board occupies about 80% of viewport height and stays centred
    Given the viewport is 1280 by 800
    And I open "index.html" directly as a file:// URL with no server or build step
    Then the board's height is about 80% of the viewport height
    And the canvas is positioned in the central part of the viewport

  # B1s-E2/E4 ("gems scale up with the board and remain centred in their cell",
  # tested via isolated-probe alpha-edge scanning of a vector shape) is retired per
  # SG1 (sprite re-skin): a raster sprite's own artwork need not be symmetric within
  # its PNG canvas, so scanning for a symmetric alpha bounding box no longer proves
  # (or disproves) centring - what actually determines centring/scaling now is the
  # draw-rect geometry in src/sprite-layout.js, exhaustively unit-tested there
  # (test/unit/sprite-layout.test.js) for every combination of cell size and sprite
  # aspect ratio. Retired here rather than replaced with a fragile pixel probe of
  # the same claim.

  @B1s-E5
  Scenario: The board fits within a narrower viewport without horizontal overflow
    Given the viewport is 400 by 800
    And I open "index.html" directly as a file:// URL with no server or build step
    Then the board does not overflow the viewport horizontally

  # B1s-E6 ("every previous board guarantee still holds at the new size") would
  # otherwise duplicate the 1280x800 example of B1s-E7 below - E7's first example
  # asserts the same 5 render facts (canvas/8x8/64-cells-filled/7-types/no-match)
  # plus centring and overflow on top, so it stands in for both.

  @B1s-E7 @integration
  Scenario Outline: A single fresh load shows the correctly-sized board with zero regression, at more than one viewport
    Given the viewport is <width> by <height>
    And I open "index.html" directly as a file:// URL with no server or build step
    Then the page renders an HTML5 canvas element for the board
    And the canvas represents an 8 by 8 grid of 64 cells
    And the canvas is positioned in the central part of the viewport
    And the board does not overflow the viewport horizontally
    And all 64 cells contain exactly one recognizable gem colour each
    And the board's 64 cells show gem colours that map to all seven known gem types
    And the board contains no horizontal or vertical run of 3 or more identical gems

    Examples:
      | width | height |
      | 1280  | 800    |
      | 400   | 800    |
