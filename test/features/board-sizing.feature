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

  @B1s-E2 @B1s-E4
  Scenario Outline: Gems scale up with the board and remain centred in their cell
    Given a single "<gem>" gem is drawn in isolation at cell size 128
    Then its bounding box is symmetric on both axes around its centre

    Examples:
      | gem             |
      | purple-triangle |
      | red-square      |
      | green-circle    |
      | yellow-diamond  |
      | blue-diamond    |
      | white-circle    |

  @B1s-E5
  Scenario: The board fits within a narrower viewport without horizontal overflow
    Given the viewport is 400 by 800
    And I open "index.html" directly as a file:// URL with no server or build step
    Then the board does not overflow the viewport horizontally

  @B1s-E6
  Scenario: Every previous board guarantee still holds at the new size
    Given the viewport is 1280 by 800
    And I open "index.html" directly as a file:// URL with no server or build step
    Then the page renders an HTML5 canvas element for the board
    And the canvas represents an 8 by 8 grid of 64 cells
    And all 64 cells contain exactly one recognizable gem colour each
    And the board's 64 cells show gem colours that map to all six known gem types
    And the board contains no horizontal or vertical run of 3 or more identical gems

  @B1s-E7 @integration
  Scenario Outline: A single fresh load shows the correctly-sized board with zero regression, at more than one viewport
    Given the viewport is <width> by <height>
    And I open "index.html" directly as a file:// URL with no server or build step
    Then the page renders an HTML5 canvas element for the board
    And the canvas represents an 8 by 8 grid of 64 cells
    And the canvas is positioned in the central part of the viewport
    And the board does not overflow the viewport horizontally
    And all 64 cells contain exactly one recognizable gem colour each
    And the board's 64 cells show gem colours that map to all six known gem types
    And the board contains no horizontal or vertical run of 3 or more identical gems

    Examples:
      | width | height |
      | 1280  | 800    |
      | 400   | 800    |
