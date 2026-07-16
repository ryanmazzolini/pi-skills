import { homedir } from "node:os";
import { join } from "node:path";

export interface IntercomPaths {
	runtimeDir: string;
	socketPath: string;
	pidPath: string;
	spawnLockPath: string;
}

/** The pi-intercom 0.6.0 Unix socket path. */
export function getBrokerSocketPath(homeDir = homedir()): string {
	return join(homeDir, ".pi", "agent", "intercom", "broker.sock");
}

export function getIntercomPaths(runtimeDir = join(homedir(), ".pi", "agent", "intercom")): IntercomPaths {
	return {
		runtimeDir,
		socketPath: join(runtimeDir, "broker.sock"),
		pidPath: join(runtimeDir, "broker.pid"),
		spawnLockPath: join(runtimeDir, "broker.spawn.lock"),
	};
}
