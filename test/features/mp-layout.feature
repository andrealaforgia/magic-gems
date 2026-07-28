Feature: The split-screen match layout fits the viewport width (MP-LAYOUT)
  As a player on any screen size
  I want the match's split-screen layout to fit without a horizontal scrollbar
  So I can see and play my own side of the match on any device

  @E1 @E2 @E3 @E4 @E5 @E6 @integration
  Scenario Outline: A real match fits the viewport horizontally at a narrow, a mid-range, and a wide screen size, with the local grid fully visible, the gauge vertically centred, and everything else still correctly positioned and playable
    Given two independent pages are both at the multiplayer lobby's name entry step
    And the first page's viewport is <width> by <height>
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    And the first page's match does not overflow the viewport horizontally
    And the first page's local grid is on the left, the remote grid is on the right, and the centre shows the countdown and gauge
    And the first page's gauge is vertically centred on the screen
    And the first page's local and remote grids are the same size, with their top edges aligned
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the first page's local and remote grids are the same size, with their top edges aligned

    Examples:
      | width | height |
      | 375   | 700    |
      | 560   | 750    |
      | 1280  | 800    |

  # MP-WINDOW-MARGIN (SPEC 13.3.8): E9 asks for "both a comfortable and a
  # narrow width" - exactly two of the three widths already established by
  # the fit scenario above, not all three (QA review, commit f3cb41d: the
  # middle width added a third full two-browser run without covering a claim
  # the other two didn't already). E5/E6 (no scrollbar, local never clipped;
  # same-size top-aligned grids) are proven not to have regressed by that
  # scenario's own already-passing assertions running at these same widths.
  @E1 @E2 @E3 @E4 @E7 @E9 @integration
  Scenario Outline: The match leaves a plainly visible, equal margin at both window edges, at a narrow and a comfortable screen size
    Given two independent pages are both at the multiplayer lobby's name entry step
    And the first page's viewport is <width> by <height>
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    And the first page's match leaves a plainly visible, equal margin at both window edges

    Examples:
      | width | height |
      | 375   | 700    |
      | 1280  | 800    |
