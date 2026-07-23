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

  # B1r-E4 ("every previously-verified B1 guarantee still holds") and B1r-E5
  # (the single-fresh-load integration check) would otherwise duplicate
  # board-renders.feature's @E8 byte-for-byte: canvas/8x8/centred/64-cells-filled/
  # 6-types/no-pre-existing-match. @E8 already re-runs against this same code (the
  # shape geometry lives in the same src/render.js it always sampled), so it stands
  # in for both here rather than tripling the exact same 6-assertion chain.
