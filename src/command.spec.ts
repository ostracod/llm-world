import { describe, expect, it } from "vitest";
import { parseCommandWithoutPrefix, playerCommandToText } from "./command.js";
import { WorldError } from "./world.js";

describe("parseCommandWithoutPrefix", () => {
    it("parses a command with one unquoted argument", () => {
        expect(parseCommandWithoutPrefix("walk east")).toEqual({
            commandName: "walk",
            args: ["east"],
        });
    });

    it("parses a command with multiple unquoted arguments", () => {
        expect(parseCommandWithoutPrefix("putItem 2 south")).toEqual({
            commandName: "putItem",
            args: ["2", "south"],
        });
    });

    it("parses a command with a quoted argument containing spaces", () => {
        expect(parseCommandWithoutPrefix('addMemo "I need to get socks."')).toEqual({
            commandName: "addMemo",
            args: ["I need to get socks."],
        });
    });

    it("parses a command with no arguments", () => {
        expect(parseCommandWithoutPrefix("wait")).toEqual({
            commandName: "wait",
            args: [],
        });
    });

    it("ignores leading and trailing whitespace", () => {
        expect(parseCommandWithoutPrefix('  addMemo  "hello"  ')).toEqual({
            commandName: "addMemo",
            args: ["hello"],
        });
    });

    it("parses mixed quoted and unquoted arguments", () => {
        expect(parseCommandWithoutPrefix('doThing north "some text"')).toEqual({
            commandName: "doThing",
            args: ["north", "some text"],
        });
    });

    it("parses an empty quoted argument", () => {
        expect(parseCommandWithoutPrefix('addMemo ""')).toEqual({
            commandName: "addMemo",
            args: [""],
        });
    });

    it("throws when the command name is missing", () => {
        expect(() => parseCommandWithoutPrefix("")).toThrow(WorldError);
        expect(() => parseCommandWithoutPrefix("")).toThrow("Missing command name.");
    });

    it("throws when a quoted argument is not closed", () => {
        expect(() => parseCommandWithoutPrefix('addMemo "unclosed')).toThrow(WorldError);
        expect(() => parseCommandWithoutPrefix('addMemo "unclosed')).toThrow(
            "Unclosed quoted argument in command."
        );
    });
});

describe("playerCommandToText", () => {
    it("leaves arguments without spaces unquoted", () => {
        expect(
            playerCommandToText({
                commandName: "putItem",
                args: ["2", "south"],
            })
        ).toBe("PERFORM_COMMAND: putItem 2 south");
    });

    it("wraps arguments containing spaces in quotation marks", () => {
        expect(
            playerCommandToText({
                commandName: "addMemo",
                args: ["I need to get socks."],
            })
        ).toBe('PERFORM_COMMAND: addMemo "I need to get socks."');
    });

    it("quotes only arguments that contain spaces", () => {
        expect(
            playerCommandToText({
                commandName: "doThing",
                args: ["north", "some text"],
            })
        ).toBe('PERFORM_COMMAND: doThing north "some text"');
    });
});
