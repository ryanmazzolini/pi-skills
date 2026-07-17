import fs from "node:fs";
import path from "node:path";
import {
  SchedulerError,
  SchedulerUsageError,
  resolveCandidate,
} from "./index.mjs";
import {
  acquireLock,
  assertInstalledPreconditions,
  discardStagedSnapshot,
  installStagedDirectory,
  installedPaths,
  readInstalled,
  replaceInstalledDirectory,
  stageInstalledSnapshot,
  verifyInstalledShims,
} from "./runtime.mjs";
import {
  adapterIdentityKey,
  catchUpWarning,
  enableAdapter,
  installAdapterDisabled,
  inventoryAdapters,
  removeAdapter,
  removeAllAdapters,
  replaceAdapter,
  statusAdapter,
} from "./adapters/index.mjs";

function requireExpectedCandidateDigest(value) {
  if (!value) throw new SchedulerUsageError("--expected-candidate-digest is required.");
}

function reviewedCandidate({ id, loadDeclaration, expectedCandidateDigest, candidateOptions }) {
  requireExpectedCandidateDigest(expectedCandidateDigest);
  const declaration = loadDeclaration();
  if (!declaration || declaration.id !== id) throw new SchedulerError(`Declared job is unavailable: ${id}`);
  const candidate = resolveCandidate(declaration, candidateOptions);
  if (candidate.digest !== expectedCandidateDigest) {
    throw new SchedulerError("Installation candidate changed; inspect the job again.", {
      code: "STALE_CANDIDATE",
      exitCode: 7,
      details: { expectedCandidateDigest, actualCandidateDigest: candidate.digest },
    });
  }
  return candidate;
}


function lifecycleFailure(message, error, rollbackFailures = []) {
  const suffix = rollbackFailures.length === 0 ? "" : `; rollback incomplete: ${rollbackFailures.join("; ")}`;
  return new SchedulerError(`${message}: ${error.message || String(error)}${suffix}`, {
    code: "LIFECYCLE",
    exitCode: 8,
    details: { cause: error.message || String(error), rollbackFailures },
  });
}

function removeStagedIfPresent(staged) {
  if (staged && fs.existsSync(staged.stageDirectory)) discardStagedSnapshot(staged);
}

function transitionSameAdapterAndState({
  previous,
  staged,
  desiredEnabled,
  previousStatus,
  adapterOptions,
}) {
  let adapterReplaced = false;
  let stateTransaction;
  try {
    replaceAdapter(previous, staged, {
      overrides: adapterOptions,
      previousWasEnabled: previousStatus.adapter.enabled,
      previousWasLoaded: previousStatus.adapter.loaded,
      enableReplacement: false,
    });
    adapterReplaced = true;
    stateTransaction = replaceInstalledDirectory(staged);
    if (desiredEnabled) enableAdapter(staged, adapterOptions);
    stateTransaction.commit();
    return;
  } catch (error) {
    const rollbackFailures = [];
    if (stateTransaction) {
      try {
        stateTransaction.rollback();
      } catch (rollbackError) {
        rollbackFailures.push(`could not restore installed state: ${rollbackError.message}`);
      }
    }
    if (adapterReplaced) {
      try {
        const current = statusAdapter(staged, adapterOptions);
        replaceAdapter(staged, previous, {
          overrides: adapterOptions,
          previousWasEnabled: current.enabled,
          previousWasLoaded: current.loaded,
          enableReplacement: previousStatus.adapter.enabled,
        });
      } catch (rollbackError) {
        rollbackFailures.push(`could not restore ${previous.snapshot.contract.adapter.selected} artifact: ${rollbackError.message}`);
      }
    }
    throw lifecycleFailure("Lifecycle transition failed", error, rollbackFailures);
  }
}

function transitionAcrossAdaptersAndState({
  previous,
  staged,
  desiredEnabled,
  previousStatus,
  adapterOptions,
}) {
  let nextInstalled = false;
  let previousRemoved = false;
  let stateTransaction;
  const installFirst = previous.snapshot.contract.adapter.selected !== staged.snapshot.contract.adapter.selected;
  try {
    if (installFirst) {
      installAdapterDisabled(staged, adapterOptions);
      nextInstalled = true;
    }
    removeAdapter(previous, adapterOptions);
    previousRemoved = true;
    if (!installFirst) {
      installAdapterDisabled(staged, adapterOptions);
      nextInstalled = true;
    }
    stateTransaction = replaceInstalledDirectory(staged);
    if (desiredEnabled) enableAdapter(staged, adapterOptions);
    stateTransaction.commit();
  } catch (error) {
    const rollbackFailures = [];
    if (stateTransaction) {
      try {
        stateTransaction.rollback();
      } catch (rollbackError) {
        rollbackFailures.push(`could not restore installed state: ${rollbackError.message}`);
      }
    }
    if (nextInstalled) {
      try {
        removeAdapter(staged, adapterOptions);
      } catch (rollbackError) {
        rollbackFailures.push(`could not remove replacement adapter: ${rollbackError.message}`);
      }
    }
    if (previousRemoved) {
      try {
        installAdapterDisabled(previous, adapterOptions);
        if (previousStatus.adapter.enabled) enableAdapter(previous, adapterOptions);
      } catch (rollbackError) {
        rollbackFailures.push(`could not restore prior adapter: ${rollbackError.message}`);
      }
    }
    throw lifecycleFailure("Cross-adapter transition failed", error, rollbackFailures);
  }
}

export function installJob({
  id,
  loadDeclaration,
  expectedCandidateDigest,
  candidateOptions,
  env = process.env,
  runnerPath,
  adapterOptions,
}) {
  if (!path.isAbsolute(runnerPath)) throw new SchedulerUsageError("runnerPath must be absolute.");
  const paths = installedPaths(id, env);
  const release = acquireLock(paths.lifecycleLockPath);
  let staged;
  try {
    if (readInstalled(id, env)) throw new SchedulerError(`Job is already installed: ${id}`);
    const candidate = reviewedCandidate({
      id,
      loadDeclaration,
      expectedCandidateDigest,
      candidateOptions,
    });
    staged = stageInstalledSnapshot(candidate, { env, revision: 1, enabled: false });
    if (staged.snapshot.contract.schedulerRunner !== fs.realpathSync(runnerPath)) {
      throw new SchedulerError("Reviewed scheduler runner does not match the installing CLI.");
    }
    installAdapterDisabled(staged, adapterOptions);
    try {
      installStagedDirectory(staged);
      staged = undefined;
    } catch (error) {
      const rollbackFailures = [];
      try {
        removeAdapter(staged, adapterOptions);
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError.message);
      }
      throw lifecycleFailure("Could not commit disabled installation", error, rollbackFailures);
    }
    return installedStatus(id, { env, adapterOptions });
  } finally {
    removeStagedIfPresent(staged);
    release();
  }
}

export function updateJob({
  id,
  loadDeclaration,
  expectedCandidateDigest,
  expectedInstalledDigest,
  expectedRevision,
  candidateOptions,
  env = process.env,
  adapterOptions,
}) {
  const paths = installedPaths(id, env);
  const release = acquireLock(paths.lifecycleLockPath);
  let staged;
  try {
    const previous = readInstalled(id, env);
    assertInstalledPreconditions(previous, {
      expectedDigest: expectedInstalledDigest,
      expectedRevision,
      allowHealthCategories: ["commands"],
    });
    if (previous.health !== "ok" && previous.metadata.enabled) {
      throw new SchedulerError("An unhealthy installed command mapping can only be recovered while the job is disabled.");
    }
    if (previous.health === "ok") verifyInstalledShims(previous);
    const previousStatus = installedStatus(id, { env, adapterOptions });
    if (previousStatus.drift.enabled || previousStatus.drift.artifact) {
      throw new SchedulerError("Installed adapter state has drift; repair or remove it before updating.");
    }
    const currentIdentity = adapterIdentityKey(previous);
    const unsafeHistoricalAdapters = inventoryAdapters(previous, adapterOptions).filter(
      (entry) => entry.identity !== currentIdentity
        && (entry.error || entry.status.available === false || entry.status.enabled === true || entry.status.loaded === true),
    );
    if (unsafeHistoricalAdapters.length > 0) {
      throw new SchedulerError(
        `Cannot update while another adapter is enabled or unverifiable: ${unsafeHistoricalAdapters.map((entry) => entry.name).join(", ")}.`,
      );
    }
    const candidate = reviewedCandidate({
      id,
      loadDeclaration,
      expectedCandidateDigest,
      candidateOptions,
    });
    const nextRevision = previous.metadata.revision + 1;
    staged = stageInstalledSnapshot(candidate, {
      env,
      revision: nextRevision,
      enabled: previous.metadata.enabled,
      installedAt: previous.metadata.installedAt,
      adapterHistory: previous.metadata.adapterHistory,
    });
    const transition = adapterIdentityKey(previous) === adapterIdentityKey(staged)
      ? transitionSameAdapterAndState
      : transitionAcrossAdaptersAndState;
    transition({
      previous,
      staged,
      desiredEnabled: previous.metadata.enabled,
      previousStatus,
      adapterOptions,
    });
    staged = undefined;
    return installedStatus(id, { env, adapterOptions });
  } finally {
    removeStagedIfPresent(staged);
    release();
  }
}

export function enableJob({
  id,
  expectedInstalledDigest,
  expectedRevision,
  env = process.env,
  adapterOptions,
}) {
  const result = changeEnablement({
    id,
    enabled: true,
    expectedInstalledDigest,
    expectedRevision,
    env,
    adapterOptions,
  });
  const warning = catchUpWarning({ snapshot: result.snapshot });
  return { ...result, ...(warning ? { warning } : {}) };
}

export function disableJob({
  id,
  expectedInstalledDigest,
  expectedRevision,
  env = process.env,
  adapterOptions,
}) {
  return changeEnablement({
    id,
    enabled: false,
    expectedInstalledDigest,
    expectedRevision,
    env,
    adapterOptions,
  });
}

function changeEnablement({
  id,
  enabled,
  expectedInstalledDigest,
  expectedRevision,
  env,
  adapterOptions,
}) {
  const paths = installedPaths(id, env);
  const release = acquireLock(paths.lifecycleLockPath);
  let staged;
  try {
    const previous = readInstalled(id, env);
    assertInstalledPreconditions(previous, {
      expectedDigest: expectedInstalledDigest,
      expectedRevision,
    });
    verifyInstalledShims(previous);
    const previousStatus = installedStatus(id, { env, adapterOptions });
    if (enabled) {
      const currentIdentity = adapterIdentityKey(previous);
      const conflicting = inventoryAdapters(previous, adapterOptions).filter(
        (entry) => entry.identity !== currentIdentity
          && (entry.error || entry.status.available === false || entry.status.enabled === true || entry.status.loaded === true),
      );
      if (conflicting.length > 0) {
        throw new SchedulerError(
          `Cannot enable while another adapter is enabled or unverifiable: ${conflicting.map((entry) => entry.name).join(", ")}.`,
        );
      }
    }
    if (
      previous.metadata.enabled === enabled
      && !previousStatus.drift.enabled
      && !previousStatus.drift.artifact
    ) return previousStatus;
    staged = stageInstalledSnapshot(
      { digest: previous.snapshot.digest, contract: previous.snapshot.contract },
      {
        env,
        revision: previous.metadata.revision + 1,
        enabled,
        installedAt: previous.metadata.installedAt,
        adapterHistory: previous.metadata.adapterHistory,
      },
    );
    transitionSameAdapterAndState({
      previous,
      staged,
      desiredEnabled: enabled,
      previousStatus,
      adapterOptions,
    });
    staged = undefined;
    return installedStatus(id, { env, adapterOptions });
  } finally {
    removeStagedIfPresent(staged);
    release();
  }
}

export function removeJob({
  id,
  expectedInstalledDigest,
  expectedRevision,
  env = process.env,
  adapterOptions,
}) {
  const paths = installedPaths(id, env);
  const release = acquireLock(paths.lifecycleLockPath);
  try {
    const installed = readInstalled(id, env);
    assertInstalledPreconditions(installed, {
      expectedDigest: expectedInstalledDigest,
      expectedRevision,
    });
    removeAllAdapters(installed, adapterOptions);
    try {
      fs.rmSync(installed.paths.jobDirectory, { recursive: true });
    } catch (error) {
      throw lifecycleFailure("Adapter artifact was removed, but installed state remains for inspection and retry", error);
    }
    return { id, removed: true };
  } finally {
    release();
  }
}

export function installedStatus(id, { env = process.env, adapterOptions } = {}) {
  const installed = readInstalled(id, env);
  if (!installed) return { id, installed: false, health: "absent" };
  if (installed.health !== "ok" && installed.health !== "unhealthy") {
    return {
      id,
      installed: true,
      health: installed.health,
      healthReason: installed.healthReason ?? null,
      metadata: installed.metadata ?? null,
      snapshot: installed.snapshot ?? null,
    };
  }
  const inventory = inventoryAdapters(installed, adapterOptions);
  const currentIdentity = adapterIdentityKey(installed);
  const currentEntry = inventory.find((entry) => entry.identity === currentIdentity);
  const identityStatus = currentEntry?.status ?? statusAdapter(installed, adapterOptions);
  const otherAdapters = inventory
    .filter((entry) => entry.identity !== currentIdentity)
    .map((entry) => ({
      name: entry.name,
      identity: entry.identity,
      status: entry.status,
      error: entry.error?.message ?? null,
    }));
  const adapterUnavailable = identityStatus.available === false;
  const adapterConflict = otherAdapters.some(
    (entry) => entry.status.enabled === true || entry.status.loaded === true,
  );
  const enabledDrift = adapterUnavailable || adapterConflict || (installed.metadata.enabled
    ? identityStatus.enabled !== true || identityStatus.loaded !== true
    : identityStatus.enabled === true || identityStatus.loaded === true);
  const health = adapterUnavailable ? "unavailable" : adapterConflict ? "conflict" : installed.health;
  return {
    id,
    installed: true,
    health,
    healthReason: adapterUnavailable
      ? `${identityStatus.name} adapter is unavailable`
      : adapterConflict
        ? "another scheduler adapter is enabled"
        : installed.healthReason ?? null,
    metadata: installed.metadata,
    snapshot: installed.snapshot,
    adapter: identityStatus,
    otherAdapters,
    drift: {
      enabled: enabledDrift,
      artifact: !identityStatus.artifactMatches,
      otherAdapters: adapterConflict,
    },
  };
}
