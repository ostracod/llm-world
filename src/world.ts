
export type Pos = [number, number]; // [x, y] coordinates.

export interface PlayerCommand {
    commandName: string;
    args: string[];
}

export const playerViewRadius = 2;
const maxInventorySize: number = 3;

export class WorldError extends Error {

}

export class World {
    width: number;
    height: number;
    entityGrid: (Entity | null)[];

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.entityGrid = [];
        const gridLength = this.width * this.height;
        while (this.entityGrid.length < gridLength) {
            this.entityGrid.push(null);
        }
    }

    containsPos(pos: Pos): boolean {
        return (pos[0] >= 0 && pos[0] < this.width && pos[1] >= 0 && pos[1] < this.height)
    }

    posToIndex(pos: Pos): number {
        return pos[0] + pos[1] * this.width;
    }

    getEntity(pos: Pos): Entity | null {
        const index = this.posToIndex(pos);
        return this.entityGrid[index];
    }

    setEntity(pos: Pos, entity: Entity | null): void {
        const index = this.posToIndex(pos);
        const oldEntity = this.entityGrid[index];
        if (oldEntity !== null) {
            oldEntity.world = null;
            oldEntity.pos = null;
        }
        this.entityGrid[index] = entity;
        if (entity !== null) {
            entity.world = this;
            entity.pos = pos;
        }
    }
}

export abstract class Entity {
    world: World | null;
    pos: Pos | null;

    constructor() {
        this.world = null;
        this.pos = null;
    }

    abstract getName(): string;

    canBeGathered(): boolean {
        return false;
    }

    receiveItem(item: Entity): void {
        throw new WorldError("This entity is not able to receive items.");
    }

    // `direction` may be "north", "south", "east", or "west" (not case sensitive).
    // Returns null if the pos is out of bounds.
    getPos(direction: string): Pos | null {
        let delta: Pos;
        switch (direction.toLowerCase()) {
            case "north":
                delta = [0, -1];
                break;
            case "south":
                delta = [0, 1];
                break;
            case "east":
                delta = [1, 0];
                break;
            case "west":
                delta = [-1, 0];
                break;
            default:
                throw new WorldError(
                    `Invalid direction: "${direction}". Expected "north", "south", "east", or "west".`
                );
        }
        const pos: Pos = [this.pos[0] + delta[0], this.pos[1] + delta[1]];
        return this.world.containsPos(pos) ? pos : null;
    }

    getPosInBounds(direction: string): Pos {
        const pos = this.getPos(direction);
        if (pos === null) {
            throw new WorldError("That direction is out of bounds.");
        }
        return pos;
    }
    
    walk(direction: string): void {
        const world = this.world;
        const oldPos = this.pos;
        const newPos: Pos = this.getPos(direction);
        if (newPos === null) {
            throw new WorldError("Cannot walk out of bounds.");
        }
        if (world.getEntity(newPos) !== null) {
            throw new WorldError("Cannot walk into occupied space.");
        }
        world.setEntity(oldPos, null);
        world.setEntity(newPos, this);
    }
}

export class Sock extends Entity {

    canBeGathered(): boolean {
        return true;
    }

    getName(): string {
        return "sock";
    }
}

export class Wall extends Entity {

    getName(): string {
        return "wall";
    }
}

export class Basket extends Entity {

    getName(): string {
        return "basket";
    }

    receiveItem(item: Entity): void {
        // Do nothing.
    }
}

export class Player extends Entity {
    inventory: Entity[];

    constructor() {
        super();
        this.inventory = [];
    }

    getName(): string {
        return "player";
    }

    takeItem(direction: string): void {
        const pos = this.getPosInBounds(direction);
        const entity = this.world.getEntity(pos);
        if (entity === null) {
            throw new WorldError("There is no item in that direction.");
        }
        if (!entity.canBeGathered()) {
            throw new WorldError("That item cannot be gathered.");
        }
        if (this.inventory.length >= maxInventorySize) {
            throw new WorldError("Your inventory is full.");
        }
        this.world.setEntity(pos, null);
        this.inventory.push(entity);
    }

    putItem(inventoryIndex: number, direction: string): void {
        if (inventoryIndex < 0 || inventoryIndex >= this.inventory.length) {
            throw new WorldError("Inventory index is out of bounds.");
        }
        const item = this.inventory[inventoryIndex];
        const pos = this.getPosInBounds(direction);
        const entity = this.world.getEntity(pos);
        if (entity === null) {
            this.world.setEntity(pos, item);
        } else {
            entity.receiveItem(item);
        }
        this.inventory.splice(inventoryIndex, 1);
    }

    private getVisibleEntityName(x: number, y: number): string {
        if (!this.world.containsPos([x, y])) {
            return "wall";
        }
        const entity = this.world.getEntity([x, y]);
        if (entity === null) {
            return "empty";
        }
        if (entity === this) {
            return "you";
        }
        return entity.getName();
    }

    getVisibleEntitiesText(): string {
        const [px, py] = this.pos!;
        const lines: string[] = [];
        for (let y = py - playerViewRadius; y <= py + playerViewRadius; y++) {
            const names: string[] = [];
            for (let x = px - playerViewRadius; x <= px + playerViewRadius; x++) {
                names.push(this.getVisibleEntityName(x, y));
            }
            lines.push(names.join(", "));
        }
        return lines.join("\n");
    }

    performCommand(command: PlayerCommand): void {
        switch (command.commandName) {
            case "walk": {
                if (command.args.length !== 1) {
                    throw new WorldError(
                        `walk expects 1 argument, got ${command.args.length}.`
                    );
                }
                this.walk(command.args[0]);
                return;
            }
            case "takeItem": {
                if (command.args.length !== 1) {
                    throw new WorldError(
                        `takeItem expects 1 argument, got ${command.args.length}.`
                    );
                }
                this.takeItem(command.args[0]);
                return;
            }
            case "putItem": {
                if (command.args.length !== 2) {
                    throw new WorldError(
                        `putItem expects 2 arguments, got ${command.args.length}.`
                    );
                }
                const inventoryItemNumber = Number(command.args[0]);
                if (!Number.isInteger(inventoryItemNumber)) {
                    throw new WorldError(
                        `Invalid inventory item number: "${command.args[0]}".`
                    );
                }
                if (
                    inventoryItemNumber < 1
                    || inventoryItemNumber > this.inventory.length
                ) {
                    throw new WorldError(
                        `Inventory item number is out of bounds: ${inventoryItemNumber}.`
                    );
                }
                this.putItem(inventoryItemNumber - 1, command.args[1]);
                return;
            }
            default:
                throw new WorldError(
                    `Unrecognized command: "${command.commandName}".`
                );
        }
    }

    getInventoryDescription(): string {
        if (this.inventory.length === 0) {
            const capacityText = (maxInventorySize === 1)
                ? "You can only hold one item at a time."
                : `You can hold up to ${maxInventorySize} items.`;
            return "Your inventory is currently empty. " + capacityText;
        }
        const itemLines = this.inventory.map((item, index) => (
            `* Inventory item #${index + 1}: ${item.getName()}`
        ));
        const remainingSpace = maxInventorySize - this.inventory.length;
        const capacityLine = (remainingSpace === 0)
            ? "Your inventory is full, so you cannot hold any more items."
            : `You have inventory space for ${remainingSpace} more item${remainingSpace === 1 ? "" : "s"}.`;
        return [
            "Your inventory currently contains the following:",
            ...itemLines,
            capacityLine,
        ].join("\n");
    }
}
