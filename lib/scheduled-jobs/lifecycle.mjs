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
  disableLaunchd,
  enableLaunchd,
  installLaunchdDisabled,
  launchdDefinition,
  launchdStatus,
  removeLaunchd,
  replaceLaunchd,
} from "./adapters/launchd.mjs";

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
  if (candidate.contract.adapter.selected !== "launchd") {
    throw new SchedulerError(`Slice B supports launchd installation only, not ${candidate.contract.adapter.selected}.`, {
      code: "ADAPTER_UNAVAILABLE",
      exitCode: 4,
    });
  }
  return candidate;
}

function definitionFor(snapshotOwner) {
  const { snapshot, paths } = snapshotOwner;
  return launchdDefinition({
    jobId: snapshot.id,
    schedule: snapshot.contract.schedule,
    nodePath: snapshot.contract.schedulerNode,
    runnerPath: snapshot.contract.schedulerRunner,
    stateRoot: snapshot.contract.scheduler.root,
    installedDigest: snapshot.digest,
    revision: snapshot.revision,
    environment: snapshot.environment,
    workingDirectory: snapshot.contract.workingDirectory,
    logPath: paths.logPath,
    homeDirectory: snapshot.environment.HOME,
  });
}

function launchdOptions(snapshot, overrides = {}) {
  return {
    launchctl: snapshot.contract.adapter.executable,
    homeDirectory: snapshot.environment.HOME,
    ...overrides,
  };
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

function transitionLaunchdAndState({
  previous,
  staged,
  desiredEnabled,
  previousWasLoaded,
  adapterOptions,
}) {
  const previousDefinition = definitionFor(previous);
  const nextDefinition = definitionFor(staged);
  const previousOptions = launchdOptions(previous.snapshot, adapterOptions);
  const nextOptions = launchdOptions(staged.snapshot, adapterOptions);
  let adapterReplaced = false;
  let stateTransaction;
  try {
    replaceLaunchd(previousDefinition, nextDefinition, {
      ...nextOptions,
      wasEnabled: previousWasLoaded,
      enableReplacement: false,
    });
    adapterReplaced = true;
    stateTransaction = replaceInstalledDirectory(staged);
    if (desiredEnabled) enableLaunchd(nextDefinition, nextOptions);
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
        const current = launchdStatus(nextDefinition, nextOptions);
        replaceLaunchd(nextDefinition, previousDefinition, {
          ...previousOptions,
          wasEnabled: current.loaded,
          enableReplacement: previousWasLoaded,
        });
      } catch (rollbackError) {
        rollbackFailures.push(`could not restore launchd artifact: ${rollbackError.message}`);
      }
    }
    throw lifecycleFailure("Lifecycle transition failed", error, rollbackFailures);
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
    const definition = definitionFor(staged);
    const options = launchdOptions(staged.snapshot, adapterOptions);
    installLaunchdDisabled(definition, options);
    try {
      installStagedDirectory(staged);
      staged = undefined;
    } catch (error) {
      const rollbackFailures = [];
      try {
        removeLaunchd(definition, options);
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
    });
    verifyInstalledShims(previous);
    const previousStatus = installedStatus(id, { env, adapterOptions });
    if (previousStatus.drift.enabled || previousStatus.drift.artifact) {
      throw new SchedulerError("Installed launchd state has drift; repair or remove it before updating.");
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
    });
    transitionLaunchdAndState({
      previous,
      staged,
      desiredEnabled: previous.metadata.enabled,
      previousWasLoaded: previousStatus.adapter.loaded,
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
  return {
    ...changeEnablement({
      id,
      enabled: true,
      expectedInstalledDigest,
      expectedRevision,
      env,
      adapterOptions,
    }),
    warning: "launchd may immediately run one missed schedule after enablement.",
  };
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
      },
    );
    transitionLaunchdAndState({
      previous,
      staged,
      desiredEnabled: enabled,
      previousWasLoaded: previousStatus.adapter.loaded,
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
    const definition = definitionFor(installed);
    const options = launchdOptions(installed.snapshot, adapterOptions);
    removeLaunchd(definition, options);
    try {
      fs.rmSync(installed.paths.jobDirectory, { recursive: true });
    } catch (error) {
      throw lifecycleFailure("Launchd artifact was removed, but installed state remains for inspection and retry", error);
    }
    return { id, removed: true };
  } finally {
    release();
  }
}

export function installedStatus(id, { env = process.env, adapterOptions } = {}) {
  const installed = readInstalled(id, env);
  if (!installed) return { id, installed: false, health: "absent" };
  if (installed.health !== "ok") {
    return {
      id,
      installed: true,
      health: installed.health,
      healthReason: installed.healthReason ?? null,
      metadata: installed.metadata ?? null,
      snapshot: installed.snapshot ?? null,
    };
  }
  const identityStatus = launchdStatus(id, {
    homeDirectory: installed.snapshot.environment.HOME,
    launchctl: installed.snapshot.contract.adapter.executable,
    ...adapterOptions,
  });
  let artifactMatches = false;
  if (identityStatus.artifactExists) {
    try {
      artifactMatches = fs.readFileSync(identityStatus.plistPath, "utf8") === definitionFor(installed).plist;
    } catch {
      artifactMatches = false;
    }
  }
  return {
    id,
    installed: true,
    health: installed.health,
    metadata: installed.metadata,
    snapshot: installed.snapshot,
    adapter: identityStatus,
    drift: {
      enabled: installed.metadata.enabled !== identityStatus.enabled,
      artifact: !artifactMatches,
    },
  };
}
