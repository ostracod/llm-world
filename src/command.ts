import { PlayerCommand, WorldError } from "./world.js";

export const commandPrefix = "PERFORM_COMMAND:";

export const parseCommandWithoutPrefix = (command: string): PlayerCommand => {
    let index = 0;
    const skipWhitespace = (): void => {
        while (index < command.length && /\s/.test(command[index])) {
            index++;
        }
    };
    const readUnquotedToken = (): string => {
        const start = index;
        while (index < command.length && !/\s/.test(command[index])) {
            index++;
        }
        return command.slice(start, index);
    };
    const readQuotedToken = (): string => {
        index++;
        const start = index;
        while (index < command.length && command[index] !== "\"") {
            index++;
        }
        if (index >= command.length) {
            throw new WorldError("Unclosed quoted argument in command.");
        }
        const value = command.slice(start, index);
        index++;
        return value;
    };

    skipWhitespace();
    const commandName = readUnquotedToken();
    if (commandName === "") {
        throw new WorldError("Missing command name.");
    }
    const args: string[] = [];
    while (true) {
        skipWhitespace();
        if (index >= command.length) {
            break;
        }
        const char = command[index];
        if (char === "\"") {
            args.push(readQuotedToken());
        } else {
            args.push(readUnquotedToken());
        }
    }
    return { commandName, args };
};

export const parseResponseMessage = (message: string): PlayerCommand => {
    const lines = message.split(/\r?\n/);
    let commandLine: string | undefined;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        if (lines[lineIndex].includes(commandPrefix)) {
            commandLine = lines[lineIndex];
            break;
        }
    }
    if (commandLine === undefined) {
        throw new WorldError(`${commandPrefix} not found in message.`);
    }
    const commandStart = commandLine.indexOf(commandPrefix);
    const remainder = commandLine
        .slice(commandStart + commandPrefix.length)
        .trim();
    return parseCommandWithoutPrefix(remainder);
}

const formatCommandArg = (arg: string): string =>
    arg.includes(" ") ? `"${arg}"` : arg;

export const playerCommandToText = (command: PlayerCommand): string => {
    const argsText = command.args.map(formatCommandArg).join(" ");
    return `${commandPrefix} ${command.commandName} ${argsText}`;
};
