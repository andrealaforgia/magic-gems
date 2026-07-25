Feature: The multiplayer lobby is backed by a real server-side session service (MP2-STORE)
  As two players on separate devices
  I want our session held by a real durable server-side store
  So we can actually find and join each other over the network, not just locally

  # E1 (the full lobby flow now works across two DISTINCT clients communicating
  # over the real network via the server-side store) and E2 (session state is
  # held server-side, keyed by the code, correctly supporting a real
  # create/join/ready round trip with each player seeing the other's real
  # name) are the exact same single round trip mp2.feature's own E8 already
  # proves, now driven through the real REST-backed session API contract
  # (api/magic-gems/session.mjs) rather than the retired localStorage stub -
  # not re-derived a second time here.

  # E3 (abandoned/stale sessions clean themselves up rather than accumulating
  # forever): the store's own TTL makes this provably true without an e2e wait
  # long enough to actually observe an hour-scale expiry, which would make
  # this suite impractically slow for no extra confidence - proven instead at
  # the unit level (test/unit/upstash-client.test.js's "setStoredSession
  # issues an authenticated POST with an EX TTL" case), which pins the exact
  # EX parameter sent on every session write.

  @E4
  Scenario: An unavailable session store surfaces a clear error, not a silent hang
    Given I open the game over a real local server, at the raw start screen, with no mode chosen yet
    And the session store is simulated as unavailable
    When I choose "Multiplayer" from the start screen
    And I type "Dana" into the lobby name field
    And I press "Enter"
    And I press "Enter"
    Then the lobby shows a clear error instead of hanging

  # E5 (single-player, the start screen, and everything else previously
  # delivered continue to work exactly as before) is mp2.feature's own E7 -
  # not re-derived here, since this change never touches single-player code.

  # E6 (integration, deployment-verified): true cross-internet behaviour
  # between two genuinely separate clients, against the ACTUALLY DEPLOYED
  # site - not this local dev checkout - cannot be automated from here: there
  # is no live deployed URL or real Upstash credentials reachable from this
  # environment. mp2.feature's own E8 is the closest local proxy (two real
  # pages, two real HTTP round trips, the real client and real API-handler
  # code, against a realistic in-memory stand-in for the real store) but it
  # is NOT a substitute for E6's own claim. Deployment (placing api/magic-gems
  # alongside the static game on the andrealaforgia.com Vercel project, with
  # its Upstash env vars) and this scenario's own live verification are called
  # out separately as the outstanding deploy need.

  # (QA review, commit 023dece): subscribeSession's poll-error-recovery path
  # (a single transient poll failure isn't surfaced; the next poll just tries
  # again) was previously untested. Proven here via a route override that
  # fails exactly the host's first status poll, then succeeds normally.
  @E7
  Scenario: A single transient poll failure does not stop the host from eventually reaching ready
    Given two independent pages are both at the multiplayer lobby's name entry step
    And the first page's next status poll will fail once, then succeed normally
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then both pages reach the ready state showing "Alice & Bob"
