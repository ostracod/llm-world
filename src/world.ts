
export type Pos = [number, number]; // [x, y] coordinates.

export const playerViewRadius = 2;
const maxInventorySize = 3;

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
        throw new Error("This entity is not able to receive items.");
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
                throw new Error(
                    `Invalid direction: "${direction}". Expected "north", "south", "east", or "west".`
                );
        }
        const pos: Pos = [this.pos[0] + delta[0], this.pos[1] + delta[1]];
        return this.world.containsPos(pos) ? pos : null;
    }

    getPosInBounds(direction: string): Pos {
        const pos = this.getPos(direction);
        if (pos === null) {
            throw new Error("That direction is out of bounds.");
        }
        return pos;
    }
    
    walk(direction: string): void {
        const world = this.world;
        const oldPos = this.pos;
        const newPos: Pos = this.getPos(direction);
        if (newPos === null) {
            throw new Error("Cannot walk out of bounds.");
        }
        if (world.getEntity(newPos) !== null) {
            throw new Error("Cannot walk into occupied space.");
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
        if (this.inventory.length >= maxInventorySize) {
            throw new Error("Your inventory is full.");
        }
        const pos = this.getPosInBounds(direction);
        const entity = this.world.getEntity(pos);
        if (entity === null) {
            throw new Error("There is no item in that direction.");
        }
        if (!entity.canBeGathered()) {
            throw new Error("That item cannot be gathered.");
        }
        this.world.setEntity(pos, null);
        this.inventory.push(entity);
    }

    putItem(inventoryIndex: number, direction: string): void {
        if (inventoryIndex < 0 || inventoryIndex >= this.inventory.length) {
            throw new Error("Inventory index is out of bounds.");
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
}
