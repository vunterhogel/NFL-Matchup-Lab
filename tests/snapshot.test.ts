import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Snapshot } from "../src/data/types";

const snapshot = JSON.parse(
  readFileSync(
    new URL("../public/data/snapshot.json", import.meta.url),
    "utf8",
  ),
) as Snapshot;

test("bundled source has all 32 team identities and traceable source metadata", () => {
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.teams.length, 32);
  assert.equal(new Set(snapshot.teams.map((team) => team.id)).size, 32);
  assert.equal(
    new Set(snapshot.games.map((game) => game.id)).size,
    snapshot.games.length,
  );
  assert.ok(Number.isFinite(Date.parse(snapshot.meta.generatedAt)));
  assert.ok(Number.isFinite(Date.parse(snapshot.meta.asOf)));
  assert.ok(snapshot.meta.sources.length >= 3);
  for (const source of snapshot.meta.sources) {
    assert.equal(new URL(source.url).protocol, "https:");
    assert.ok(Number.isFinite(Date.parse(source.fetchedAt)));
  }
});

test("every included analytical game has paired, opposing team records and a final schedule status", () => {
  const teamIds = new Set(snapshot.teams.map((team) => team.id));
  const games = new Map(snapshot.games.map((game) => [game.id, game]));
  const includedIds = new Set(snapshot.teamGames.map((row) => row.gameId));
  assert.equal(includedIds.size, snapshot.meta.completedGames);
  assert.equal(snapshot.teamGames.length, includedIds.size * 2);
  for (const gameId of includedIds) {
    const game = games.get(gameId);
    assert.ok(game, `Schedule missing ${gameId}`);
    assert.equal(game.status, "final", `${gameId} is not final`);
    const rows = snapshot.teamGames.filter((row) => row.gameId === gameId);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].teamId, rows[1].opponentId);
    assert.equal(rows[1].teamId, rows[0].opponentId);
    for (const row of rows) {
      assert.ok(teamIds.has(row.teamId));
      assert.ok(teamIds.has(row.opponentId));
      assert.notEqual(row.teamId, row.opponentId);
      assert.equal(row.stats.games, 1);
      for (const value of Object.values(row.stats))
        assert.ok(Number.isFinite(value));
    }
  }
});

test("target counts and depth partitions reconcile with the bundled coverage manifest", () => {
  const targets = snapshot.teamGames.reduce(
    (sum, row) => sum + (row.stats.targets ?? 0),
    0,
  );
  assert.equal(targets, snapshot.meta.coverage.targets);
  assert.ok(targets > 0);
  assert.ok(snapshot.meta.coverage.positionMatchedTargets <= targets);
  assert.equal(
    snapshot.meta.coverage.targetPositionJoinRate,
    snapshot.meta.coverage.positionMatchedTargets / targets,
  );
  assert.ok(snapshot.meta.coverage.targetPositionJoinRate >= 0.98);
  for (const { gameId, teamId, stats } of snapshot.teamGames) {
    const label = `${gameId}:${teamId}`;
    assert.equal(
      (stats.shortTargets ?? 0) +
        (stats.intermediateTargets ?? 0) +
        (stats.deepTargets ?? 0),
      stats.depthTargets ?? 0,
      label,
    );
    assert.ok((stats.depthTargets ?? 0) <= (stats.targets ?? 0), label);
    assert.ok(
      (stats.rbTargets ?? 0) +
        (stats.wrTargets ?? 0) +
        (stats.teTargets ?? 0) <=
        (stats.targets ?? 0),
      label,
    );
    assert.ok((stats.completions ?? 0) <= (stats.attempts ?? 0), label);
    assert.ok((stats.rbCarries ?? 0) <= (stats.designedCarries ?? 0), label);
    assert.ok((stats.designedCarries ?? 0) <= (stats.carries ?? 0), label);
  }
});

test("player observations refer to known games/identities and receiving targets reconcile", () => {
  const gameIds = new Set(snapshot.teamGames.map((row) => row.gameId));
  const playerIds = new Set(snapshot.players.map((player) => player.id));
  assert.equal(playerIds.size, snapshot.players.length);
  const teamTargets = snapshot.teamGames.reduce(
    (sum, row) => sum + (row.stats.targets ?? 0),
    0,
  );
  let playerTargets = 0;
  for (const row of snapshot.playerGames) {
    assert.ok(gameIds.has(row.gameId));
    assert.ok(playerIds.has(row.playerId));
    assert.ok(
      snapshot.teamGames.some(
        (teamRow) =>
          teamRow.gameId === row.gameId && teamRow.teamId === row.teamId,
      ),
    );
    playerTargets += row.stats.targets ?? 0;
    for (const value of Object.values(row.stats))
      assert.ok(Number.isFinite(value));
  }
  assert.equal(playerTargets, teamTargets);
});
