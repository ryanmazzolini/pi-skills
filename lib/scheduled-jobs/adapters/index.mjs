import fs from "node:fs";
import path from "node:path";
import {
  enableLaunchd,
  installLaunchdDisabled,
  launchdDefinition,
  launchdStatus,
  removeLaunchd,
  replaceLaunchd,
} from "./launchd.mjs";
import {
  enableSystemd,
  installSystemdDisabled,
  removeSystemd,
  replaceSystemd,
  systemdDefinition,
  systemdStatus,
} from "./systemd.mjs";
import {
  cronDefinition,
  cronStatus,
  enableCron,
  installCronDisabled,
  removeCron,
  replaceCron,
} from "./cron.mjs";

function selected(snapshotOwner) {
  return snapshotOwner.snapshot.contract.adapter.selected;
}

function overridesFor(name, overrides) {
  if (!overrides) return {};
  return overrides[name] ?? overrides;
}

export function adapterDefinition(snapshotOwner) {
  const { snapshot, paths } = snapshotOwner;
  const common = {
    jobId: snapshot.id,
    schedule: snapshot.contract.schedule,
    launcherPath: snapshot.contract.scheduler.launcherPath,
    nodePath: snapshot.contract.schedulerNode,
    runnerPath: snapshot.contract.schedulerRunner,
    stateRoot: snapshot.contract.scheduler.root,
    installedDigest: snapshot.digest,
    revision: snapshot.revision,
    logPath: paths.logPath,
  };
  if (selected(snapshotOwner) === "launchd") {
    return launchdDefinition({
      ...common,
      environment: snapshot.environment,
      workingDirectory: snapshot.contract.workingDirectory,
      homeDirectory: snapshot.environment.HOME,
    });
  }
  if (selected(snapshotOwner) === "systemd") {
    return systemdDefinition({
      ...common,
      environment: snapshot.environment,
      workingDirectory: snapshot.contract.workingDirectory,
      homeDirectory: snapshot.environment.HOME,
      configHome: snapshot.contract.adapter.configHome,
    });
  }
  if (selected(snapshotOwner) === "cron") return cronDefinition(common);
  throw new Error(`Unsupported scheduler adapter: ${selected(snapshotOwner)}`);
}

function adapterVariant(snapshotOwner, name, descriptor) {
  if (snapshotOwner.snapshot.contract.adapter.selected === name) return snapshotOwner;
  return {
    ...snapshotOwner,
    snapshot: {
      ...snapshotOwner.snapshot,
      contract: {
        ...snapshotOwner.snapshot.contract,
        adapter: {
          selected: name,
          executable: descriptor.executable,
          mode: "installed-history",
          ...(descriptor.configHome ? { configHome: descriptor.configHome } : {}),
        },
      },
      environment: {
        ...snapshotOwner.snapshot.environment,
        HOME: descriptor.homeDirectory || snapshotOwner.snapshot.environment.HOME,
      },
    },
    metadata: { ...snapshotOwner.metadata, enabled: false },
  };
}

export function adapterIdentityKey(snapshotOwner) {
  const name = selected(snapshotOwner);
  const definition = adapterDefinition(snapshotOwner);
  if (name === "launchd") return `${name}:${definition.plistPath}`;
  if (name === "systemd") return `${name}:${definition.servicePath}:${definition.timerPath}`;
  return `${name}:${definition.marker}`;
}

export function adapterOptions(snapshotOwner, overrides) {
  const name = selected(snapshotOwner);
  const selectedOverrides = overridesFor(name, overrides);
  if (name === "launchd") {
    return {
      launchctl: snapshotOwner.snapshot.contract.adapter.executable,
      homeDirectory: snapshotOwner.snapshot.environment.HOME,
      ...selectedOverrides,
    };
  }
  if (name === "systemd") {
    return {
      systemctl: snapshotOwner.snapshot.contract.adapter.executable,
      homeDirectory: snapshotOwner.snapshot.environment.HOME,
      configHome: snapshotOwner.snapshot.contract.adapter.configHome,
      ...selectedOverrides,
    };
  }
  if (name === "cron") {
    return {
      crontab: snapshotOwner.snapshot.contract.adapter.executable,
      lockPath: path.join(snapshotOwner.snapshot.contract.scheduler.root, "locks", "cron.lock"),
      ...selectedOverrides,
    };
  }
  throw new Error(`Unsupported scheduler adapter: ${name}`);
}

function filesMatch(definition, status, name) {
  try {
    if (name === "launchd") {
      return status.artifactExists && fs.readFileSync(status.plistPath, "utf8") === definition.plist;
    }
    if (name === "systemd") {
      return status.artifactExists
        && fs.readFileSync(status.servicePath, "utf8") === definition.service
        && fs.readFileSync(status.timerPath, "utf8") === definition.timer;
    }
    return status.artifactMatches;
  } catch {
    return false;
  }
}

export function statusAdapter(snapshotOwner, overrides) {
  const name = selected(snapshotOwner);
  const definition = adapterDefinition(snapshotOwner);
  const options = adapterOptions(snapshotOwner, overrides);
  let raw;
  if (name === "launchd") raw = launchdStatus(definition, options);
  else if (name === "systemd") raw = systemdStatus(definition, options);
  else raw = cronStatus(definition, options);
  const loaded = name === "systemd" ? raw.active : raw.loaded;
  const artifactMatches = name === "cron" && snapshotOwner.metadata?.enabled === false
    ? !raw.artifactExists
    : filesMatch(definition, raw, name);
  return {
    ...raw,
    name,
    loaded,
    enabled: raw.enabled,
    disabled: name === "systemd" ? raw.enabled === false && raw.active === false : raw.disabled,
    artifactMatches,
  };
}

export function installAdapterDisabled(snapshotOwner, overrides) {
  const name = selected(snapshotOwner);
  const definition = adapterDefinition(snapshotOwner);
  const options = adapterOptions(snapshotOwner, overrides);
  if (name === "launchd") return installLaunchdDisabled(definition, options);
  if (name === "systemd") return installSystemdDisabled(definition, options);
  return installCronDisabled(definition, options);
}

export function enableAdapter(snapshotOwner, overrides) {
  const name = selected(snapshotOwner);
  const definition = adapterDefinition(snapshotOwner);
  const options = adapterOptions(snapshotOwner, overrides);
  if (name === "launchd") return enableLaunchd(definition, options);
  if (name === "systemd") return enableSystemd(definition, options);
  return enableCron(definition, options);
}

export function replaceAdapter(previous, next, {
  overrides,
  previousWasEnabled,
  previousWasLoaded,
  enableReplacement,
} = {}) {
  const previousName = selected(previous);
  const nextName = selected(next);
  if (previousName !== nextName) throw new Error("replaceAdapter requires the same adapter type.");
  const previousDefinition = adapterDefinition(previous);
  const nextDefinition = adapterDefinition(next);
  const options = adapterOptions(next, overrides);
  if (nextName === "launchd") {
    return replaceLaunchd(previousDefinition, nextDefinition, {
      ...options,
      wasEnabled: previousWasLoaded,
      enableReplacement,
    });
  }
  if (nextName === "systemd") {
    return replaceSystemd(previousDefinition, nextDefinition, {
      ...options,
      wasEnabled: previousWasEnabled,
      wasActive: previousWasLoaded,
      enableReplacement,
      activateReplacement: enableReplacement,
    });
  }
  return replaceCron(previousDefinition, nextDefinition, {
    ...options,
    wasEnabled: previousWasEnabled,
    enableReplacement,
  });
}

export function removeAdapter(snapshotOwner, overrides) {
  const name = selected(snapshotOwner);
  const definition = adapterDefinition(snapshotOwner);
  const options = adapterOptions(snapshotOwner, overrides);
  if (name === "launchd") return removeLaunchd(definition, options);
  if (name === "systemd") return removeSystemd(definition, options);
  return removeCron(definition, options);
}

export function inventoryAdapters(snapshotOwner, overrides) {
  const history = snapshotOwner.metadata?.adapterHistory || {
    [selected(snapshotOwner)]: {
      executable: snapshotOwner.snapshot.contract.adapter.executable,
      configHome: snapshotOwner.snapshot.contract.adapter.configHome,
      homeDirectory: snapshotOwner.snapshot.environment.HOME,
    },
  };
  const seen = new Set();
  const inventory = [];
  for (const [name, descriptor] of Object.entries(history)) {
    const variant = adapterVariant(snapshotOwner, name, descriptor);
    const identity = adapterIdentityKey(variant);
    if (seen.has(identity)) continue;
    seen.add(identity);
    try {
      inventory.push({ name, identity, variant, status: statusAdapter(variant, overrides) });
    } catch (error) {
      inventory.push({
        name,
        identity,
        variant,
        status: { name, available: false, enabled: null, loaded: null, artifactMatches: false },
        error,
      });
    }
  }
  return inventory;
}

export function removeAllAdapters(snapshotOwner, overrides) {
  const failures = [];
  for (const entry of inventoryAdapters(snapshotOwner, overrides)) {
    try {
      removeAdapter(entry.variant, overrides);
    } catch (error) {
      failures.push(`${entry.name}: ${error.message}`);
    }
  }
  if (failures.length > 0) throw new Error(`Could not remove every scheduler adapter: ${failures.join("; ")}`);
}

export function catchUpWarning(snapshotOwner) {
  const name = selected(snapshotOwner);
  if (name === "cron") return undefined;
  return `${name} may immediately run one missed schedule after enablement.`;
}
