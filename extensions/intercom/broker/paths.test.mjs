import assert from "node:assert/strict";
import test from "node:test";
import { getBrokerSocketPath, getIntercomPaths } from "./paths.ts";

test("preserves the exact legacy Unix socket and runtime filenames", () => {
	assert.equal(getBrokerSocketPath("/Users/example"), "/Users/example/.pi/agent/intercom/broker.sock");
	assert.deepEqual(getIntercomPaths("/tmp/intercom"), {
		runtimeDir: "/tmp/intercom",
		socketPath: "/tmp/intercom/broker.sock",
		pidPath: "/tmp/intercom/broker.pid",
		spawnLockPath: "/tmp/intercom/broker.spawn.lock",
	});
});
