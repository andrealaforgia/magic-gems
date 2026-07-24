Feature: An S-key mute toggle and its on-screen hint (AUDIO-TOGGLE)
  As a player
  I want to turn game sound on or off and know how to do it
  So that I can play quietly when I need to

  @E1 @e2e
  Scenario: Pressing S mutes all subsequent sound events
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "s"
    Then audio is muted
    When I press "ArrowRight"
    Then the sound log does not include "cursor-move"

  @E1 @e2e
  Scenario: While muted, a full swap-to-settle cycle plays no sound at all
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "s"
    Then audio is muted
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the sound log is empty

  @E2 @e2e
  Scenario: Audio defaults to on, and a second S press turns it back on
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then audio is unmuted
    When I press "s"
    Then audio is muted
    When I press "s"
    Then audio is unmuted
    When I press "ArrowRight"
    Then the sound log includes "cursor-move"

  @E3
  Scenario: An instruction line at the bottom of the grid explains the S key
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the audio instruction line reads "S — TOGGLE AUDIO" in the pixel font, below the grid

  @E4
  Scenario: Existing controls keep working regardless of the S key or audio state
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "s"
    Then audio is muted
    When I press "ArrowRight"
    Then the cursor highlight is at cell 0,1
    When I press "Space"
    Then the selection highlight is at cell 0,1
    When I press "Escape"
    Then no selection or target highlight is present

  # E5 (all other previously delivered behaviour is unchanged) is every pre-existing
  # sprite-reskin/scoring/board/game/shatter/no-spin/display-polish/fix-select/audio/
  # bonus-tune scenario, all still green with the mute toggle wired in. Not
  # re-derived here.

  @E7
  Scenario: Toggling audio shows fading feedback text, both directions
    Given I open "index.html" directly as a file:// URL with no server or build step
    When I press "s"
    Then the "SOUND OFF" toast is visible, large and white, in the pixel font
    And the audio toast fades away
    When I press "s"
    Then the "SOUND ON" toast is visible, large and white, in the pixel font
    And the audio toast fades away

  @E6 @integration
  Scenario: A full fresh-load play cycle shows the hint, mutes and unmutes cleanly, with feedback each time
    Given I open "index.html" directly as a file:// URL with no server or build step
    Then the audio instruction line reads "S — TOGGLE AUDIO" in the pixel font, below the grid
    When I press "s"
    Then audio is muted
    And the "SOUND OFF" toast is visible, large and white, in the pixel font
    And the audio toast fades away
    And I locate an adjacent swap that would produce a match on the live board
    When I commit that swap
    And the shatter animation has settled
    Then the sound log is empty
    Then the board contains no horizontal or vertical run of 3 or more identical gems
    When I press "s"
    Then audio is unmuted
    And the "SOUND ON" toast is visible, large and white, in the pixel font
    And the audio toast fades away
