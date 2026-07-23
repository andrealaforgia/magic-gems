Feature: Board rendering refinement (B1r)
  As a player
  I want the yellow gem to look like a plain equilateral diamond and the blue gem to
  keep its distinct cut-gemstone silhouette, with every gem properly centred in its cell
  So that the board reads cleanly and consistently at a glance

  @B1r-E1
  Scenario: The yellow gem is an equilateral diamond, not elongated
    Given a single "yellow-diamond" gem is drawn in isolation
    Then its bounding box is symmetric on both axes around its centre
    And all four of its sides are equal length

  @B1r-E2
  Scenario: The blue gem keeps its distinct cut-gemstone silhouette, pointing down
    Given a single "blue-diamond" gem is drawn in isolation
    Then it is rendered as a "diamond" filled with its own distinct colour
    And it has a flat top edge unlike the yellow gem's pointed apex

  @B1r-E3
  Scenario Outline: Every gem type is centred in its cell on both axes
    Given a single "<gem>" gem is drawn in isolation
    Then its bounding box is symmetric on both axes around its centre

    Examples:
      | gem             |
      | purple-triangle |
      | red-square      |
      | green-circle    |
      | yellow-diamond  |
      | blue-diamond    |
      | white-circle    |

  @B1r-E4
  Scenario: Every previously-verified B1 guarantee still holds unchanged
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the page renders an HTML5 canvas element for the board
    And the canvas represents an 8 by 8 grid of 64 cells
    And the canvas is positioned in the central part of the viewport
    And all 64 cells contain exactly one recognizable gem colour each
    And the board's 64 cells show gem colours that map to all six known gem types
    And the board contains no horizontal or vertical run of 3 or more identical gems

  @B1r-E5 @integration
  Scenario: A single fresh load shows the corrected shapes and every B1 guarantee at once
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the page renders an HTML5 canvas element for the board
    And the canvas represents an 8 by 8 grid of 64 cells
    And the canvas is positioned in the central part of the viewport
    And all 64 cells contain exactly one recognizable gem colour each
    And the board's 64 cells show gem colours that map to all six known gem types
    And the board contains no horizontal or vertical run of 3 or more identical gems
