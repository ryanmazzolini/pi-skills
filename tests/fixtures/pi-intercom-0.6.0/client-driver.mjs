import readline from "node:readline";
import { IntercomClient } from "./broker/client.ts";

const client = new IntercomClient();

function emit(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

client.on("message", (from, message) => emit({ event: "message", from, message }));
client.on("session_joined", (session) => emit({ event: "session_joined", session }));
client.on("session_left", (sessionId) => emit({ event: "session_left", sessionId }));
client.on("presence_update", (session) => emit({ event: "presence_update", session }));
client.on("disconnected", (error) => emit({ event: "disconnected", error: error.message }));
client.on("error", (error) => emit({ event: "error", error: error.message }));

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
	if (!line.trim()) continue;
	let command;
	try {
		command = JSON.parse(line);
		let value;
		switch (command.action) {
			case "connect":
				await client.connect(command.session);
				value = { sessionId: client.sessionId };
				break;
			case "list":
				value = await client.listSessions();
				break;
			case "send":
				value = await client.send(command.to, command.options);
				break;
			case "presence":
				client.updatePresence(command.updates);
				value = true;
				break;
			case "disconnect":
				await client.disconnect();
				value = true;
				break;
			default:
				throw new Error(`Unknown driver action: ${command.action}`);
		}
		emit({ response: command.id, value });
	} catch (error) {
		emit({ response: command?.id, error: error instanceof Error ? error.message : String(error) });
	}
}
await client.disconnect();
