import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { Pos, playerViewRadius, World, Sock, Wall, Basket, Player } from "./world.js";

const sockAmount = 10;

const llmHostport = "localhost:1234";
const llmModel = "google/gemma-4-e2b";

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
};

function getWorldState(): WorldState {
    const entityNames: (string | null)[] = world.entityGrid.map((entity) => (
        (entity === null) ? null : entity.getName()
    ));
    return { width: world.width, height: world.height, entities: entityNames };
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

server.listen(3000, () => {
    console.log("Server listening on http://localhost:3000");
});

interface ResponseTurn {
    type: string;
    content: string;
}

while (true) {
    const visibleEntitiesText = player.getVisibleEntitiesText();
    const prompt = `You are a player in a virtual world which is a grid of ${world.width} by ${world.height} spaces. Your mission is to collect all of the socks in the world and put them in a basket.

These are the contents of the spaces which are visible within a radius centered around you:

${visibleEntitiesText}

Your inventory is currently empty.

You are able to perform commands to move and interact with the world. For all commands, <direction> may be \`north\`, \`south\`, \`east\`, or \`west\`.
Each command begins with \`PERFORM_COMMAND:\`, followed by a command name and arguments. The following commands are available:
* \`PERFORM_COMMAND: walk <direction>\`
    * Moves you in the specified direction. This command cannot pick up items.
    * For example: \`PERFORM_COMMAND: walk east\` moves you east.
* \`PERFORM_COMMAND: takeItem <direction>\`
    * Picks up the item which is next to you, if any.
    * For example: \`PERFORM_COMMAND: takeItem north\` picks up the item immediately north of you.
* \`PERFORM_COMMAND: putItem <inventoryItemNumber> <direction>\`
    * Places the specified inventory item into the space next to you.
    * If the space contains a basket, this command puts the item into the basket. Otherwise, this command puts the item on the ground.
    * For example: \`PERFORM_COMMAND: putItem 2 south\` places inventory item #2 immediately south of you.

Please respond with a command now to perform your next action in the world. Make sure that the command begins with \`PERFORM_COMMAND:\`.
`;
    const fetchResponse = await fetch(`http://${llmHostport}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: llmModel,
            system_prompt: "",
            input: prompt,
        }),
    });
    const responseTurns = (await fetchResponse.json()).output as ResponseTurn[];
    const responseReasoning = responseTurns.find((item) => (item.type === "reasoning")).content;
    const responseMessage = responseTurns.find((item) => (item.type === "message")).content;
    if (typeof responseReasoning !== "undefined") {
        console.log(responseReasoning);
    }
    console.log(responseMessage);
    break;
}
