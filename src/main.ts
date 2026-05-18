import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { Pos, PlayerCommand, playerViewRadius, maxMemoLength, WorldError, World, Sock, Wall, Basket, Player } from "./world.js";
import { commandPrefix, parseResponseMessage, playerCommandToText } from "./command.js";

const sockAmount = 10;

const llmHostport = "localhost:1234";
const llmModel = "google/gemma-4-e4b";

const world = new World(12, 12);
const player = new Player();
world.setEntity([3, 3], player);
world.setEntity([4, 6], new Basket());
for (let posY = 2; posY < 10; posY++) {
    world.setEntity([7, posY], new Wall());
}
for (let count = 0; count < sockAmount; count++) {
    let pos: Pos;
    do {
        pos = [
            Math.floor(Math.random() * world.width),
            Math.floor(Math.random() * world.height),
        ];
    } while (world.getEntity(pos) !== null);
    world.setEntity(pos, new Sock());
}

interface WorldState {
    width: number;
    height: number;
    entities: (string | null)[];
    inventory: string[];
};

function getWorldState(): WorldState {
    const entityNames: (string | null)[] = world.entityGrid.map((entity) => (
        (entity === null) ? null : entity.getName()
    ));
    return {
        width: world.width,
        height: world.height,
        entities: entityNames,
        inventory: player.inventory.map((entity) => entity.getName()),
    };
}

const staticDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "staticBrowserFiles"
);

const app = express();
app.get("/constants", (_req, res) => {
    res.json({ playerViewRadius });
});
app.use(express.static(staticDir));

const server = createServer(app);
const wss = new WebSocketServer({ server });

function broadcastWorldState(): void {
    const message = JSON.stringify(getWorldState());
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

wss.on("connection", (ws) => {
    ws.send(JSON.stringify(getWorldState()));
});

interface ResponseTurn {
    type: string;
    content: string;
}

interface ChatStreamEvent {
    type: string;
    content?: string;
    result?: {
        output: ResponseTurn[];
    };
    error?: unknown;
}

const fetchLlmResponseMessage = async (prompt: string): Promise<string> => {
    const fetchResponse = await fetch(`http://${llmHostport}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: llmModel,
            system_prompt: "",
            input: prompt,
            stream: true,
        }),
    });
    if (!fetchResponse.ok) {
        throw new Error(`LLM request failed with status ${fetchResponse.status}.`);
    }
    if (fetchResponse.body === null) {
        throw new Error("LLM response body is empty.");
    }

    const decoder = new TextDecoder();
    const reader = fetchResponse.body.getReader();
    let buffer = "";
    let responseMessage = "";
    let reasoningHeaderPrinted = false;

    const processEventBlock = (block: string): void => {
        if (block.trim() === "") {
            return;
        }
        let dataJson: string | undefined;
        for (const line of block.split("\n")) {
            if (line.startsWith("data: ")) {
                dataJson = line.slice(6);
            }
        }
        if (dataJson === undefined) {
            return;
        }
        const event = JSON.parse(dataJson) as ChatStreamEvent;
        switch (event.type) {
            case "reasoning.start":
                if (!reasoningHeaderPrinted) {
                    console.log("LLM reasoning:");
                    reasoningHeaderPrinted = true;
                }
                break;
            case "reasoning.delta":
                if (!reasoningHeaderPrinted) {
                    console.log("LLM reasoning:");
                    reasoningHeaderPrinted = true;
                }
                if (event.content !== undefined) {
                    process.stdout.write(event.content);
                }
                break;
            case "reasoning.end":
                if (reasoningHeaderPrinted) {
                    console.log("");
                }
                break;
            case "message.delta":
                if (event.content !== undefined) {
                    responseMessage += event.content;
                }
                break;
            case "chat.end": {
                const messageTurn = event.result?.output.find(
                    (item) => item.type === "message"
                );
                if (messageTurn !== undefined) {
                    responseMessage = messageTurn.content;
                }
                break;
            }
            case "error":
                throw new Error(`LLM stream error: ${JSON.stringify(event.error)}`);
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");
        let boundaryIndex: number;
        while ((boundaryIndex = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);
            processEventBlock(block);
        }
    }
    buffer = buffer.replace(/\r\n/g, "\n");
    if (buffer.trim() !== "") {
        processEventBlock(buffer);
    }

    return responseMessage;
};

const runLlm = async () => {
    let lastCommand: PlayerCommand | null = null;
    let lastCommandError: string | null = null;
    while (true) {
        console.log("========================================================");
        console.log("Prompting LLM...\n");
        const visibleEntitiesText = player.getVisibleEntitiesText();
        let lastCommandDescription: string;
        if (lastCommand === null) {
            lastCommandDescription = "You have not issued any commands yet.";
        } else {
            const lastCommandText = playerCommandToText(lastCommand);
            if (lastCommandError === null) {
                lastCommandDescription = `During your previous turn, you issued this command:
${lastCommandText}
This command finished successfully.`;
            } else {
                lastCommandDescription = `During your previous turn, you tried to issue this command:
${lastCommandText}
This command failed with the following message: "${lastCommandError}"`;
            }
        }
        const prompt = `You are a player in a virtual world which is a grid of ${world.width} by ${world.height} spaces. The world contains socks in random positions and a basket. Your mission is to collect socks and put them in the basket.

You are able to perform commands to move, interact with the world, and update your memories ("memos").
Each command begins with \`${commandPrefix}\`, followed by a command name and arguments. For commands which accept a direction, <direction> may be \`north\`, \`south\`, \`east\`, or \`west\`.
The following commands are available:
* \`${commandPrefix} walk <direction>\`
    * Moves you in the specified direction. This command cannot pick up items.
    * For example: \`${commandPrefix} walk east\` moves you east.
* \`${commandPrefix} takeItem <direction>\`
    * Picks up the item which is adjacent to you (if any) in the specified direction.
    * The item will be added to your inventory. This command will fail if your inventory is full.
    * For example: \`${commandPrefix} takeItem north\` picks up the item immediately north of you.
* \`${commandPrefix} putItem <inventoryItemNumber> <direction>\`
    * Places the specified inventory item into the space adjacent to you in the specified direction.
    * If the space contains a basket, this command puts the item into the basket. Otherwise, this command puts the item on the ground.
    * For example: \`${commandPrefix} putItem 2 south\` places inventory item #2 immediately south of you.
* \`${commandPrefix} addMemo "<message>"\`
    * Adds a memo which will be visible to you during future turns.
    * Each memo cannot be longer than ${maxMemoLength} characters long, and cannot contain newlines.
    * For example: \`${commandPrefix} addMemo "I need to get socks."\` adds a memo with the message "I need to get socks.".
* \`${commandPrefix} deleteMemo <memoNumber>\`
    * Deletes the specified memo, so you will not see it during future turns.
    * For example: \`${commandPrefix} deleteMemo 3\` deletes memo #3.

You should use memos to save important information about the world and your current strategy. Between turns your chain-of-thought reasoning is erased, but memos persist. Before you move or interact with the world, make sure that your memos are updated to reflect your current observations and plans.

${lastCommandDescription}

${player.getMemosText()}

Your current coordinates are X = ${player.pos[0]}, Y = ${player.pos[1]}.

These are the current contents of the spaces which are visible within a 5 by 5 viewport centered around you:

${visibleEntitiesText}

(Rows are listed from north to south, and each row lists spaces from west to east.)

${player.getInventoryDescription()}

Please respond with a command now to perform your next action. Make sure that the command begins with \`${commandPrefix}\`.`;
        console.log(prompt);
        const responseMessage = await fetchLlmResponseMessage(prompt);
        console.log("LLM response message:");
        console.log(responseMessage);
        try {
            lastCommand = parseResponseMessage(responseMessage);
            console.log(lastCommand);
            player.performCommand(lastCommand);
            lastCommandError = null;
        } catch (error) {
            if (error instanceof WorldError) {
                lastCommandError = error.message;
                console.log(lastCommandError);
            } else {
                throw error;
            }
        }
        console.log("");
        broadcastWorldState();
    }
}

server.listen(3000, () => {
    console.log("Server listening on http://localhost:3000\n");
    runLlm();
});
