import assert from "node:assert/strict";
import test from "node:test";
import registerSessionId from "./session-id.ts";

test("shows the active session ID in the footer", () => {
	let sessionStart;
	const statuses = [];
	const pi = {
		on(event, handler) {
			if (event === "session_start") sessionStart = handler;
		},
	};

	registerSessionId(pi);
	assert.ok(sessionStart);

	sessionStart({}, {
		sessionManager: {
			getSessionId: () => "session-123",
		},
		ui: {
			setStatus: (id, text) => statuses.push({ id, text }),
			theme: {
				fg: (color, text) => `<${color}>${text}</${color}>`,
			},
		},
	});

	assert.deepEqual(statuses, [{
		id: "session-id",
		text: "<dim>[session-123]</dim>",
	}]);
});
