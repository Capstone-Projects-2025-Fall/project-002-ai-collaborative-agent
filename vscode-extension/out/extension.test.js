"use strict";
// extension.test.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
// We must import the functions we want to test
const extension_1 = require("./extension"); // Adjust path if needed
// --- Mocking Section ---
// We tell Vitest: "anytime code asks for the 'vscode' module, give them our fake version"
vitest_1.vi.mock("vscode", () => {
    // A fake workspace with a fake folder path
    const mockWorkspace = {
        workspaceFolders: [
            {
                uri: {
                    fsPath: "/mock/workspace", // A pretend folder
                },
            },
        ],
    };
    // A fake window object with a spy on showErrorMessage
    const mockWindow = {
        showErrorMessage: vitest_1.vi.fn(), // vi.fn() creates a "spy" we can check later
        showInformationMessage: vitest_1.vi.fn(),
    };
    // Return the complete fake vscode API
    return {
        workspace: mockWorkspace,
        window: mockWindow,
        // Add any other vscode properties your code might need here
    };
});
// We also mock the 'fs/promises' module to avoid touching the actual file system
vitest_1.vi.mock("fs/promises");
// --- Test Suite ---
(0, vitest_1.describe)("Data Handling Logic", () => {
    // This runs before each 'it' block, resetting our mocks
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    // Test suite for the loadInitialData function
    (0, vitest_1.describe)("loadInitialData", () => {
        (0, vitest_1.it)("should load and parse data when the file exists", async () => {
            // Arrange: Setup our test scenario
            const mockData = {
                users: [{ id: 1, name: "Alex" }],
                projects: [{ id: 101, name: "Test Project" }],
                promptCount: 5,
            };
            // Make the mocked fs.readFile return our fake data
            vitest_1.vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));
            // Act: Run the function we are testing
            const result = await (0, extension_1.loadInitialData)();
            // Assert: Check if the result is what we expect
            (0, vitest_1.expect)(result.users).toHaveLength(1);
            (0, vitest_1.expect)(result.projects).toHaveLength(1);
            (0, vitest_1.expect)(result.promptCount).toBe(5);
            // It should also ensure 'selectedMemberIds' is an array
            (0, vitest_1.expect)(result.projects[0].selectedMemberIds).toEqual([]);
        });
        (0, vitest_1.it)("should return a default state if the data file does not exist", async () => {
            // Arrange: Make the mocked fs.readFile throw an error (like a missing file)
            vitest_1.vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));
            // Act: Run the function
            const result = await (0, extension_1.loadInitialData)();
            // Assert: Check that we get the default empty object
            (0, vitest_1.expect)(result).toEqual({
                users: [],
                projects: [],
                promptCount: 0,
            });
        });
    });
    // Test suite for the saveInitialData function
    (0, vitest_1.describe)("saveInitialData", () => {
        (0, vitest_1.it)("should call fs.writeFile with the correct path and stringified data", async () => {
            // Arrange
            const dataToSave = { users: [{ id: 2, name: "Beth" }] };
            const expectedPath = path.join("/mock/workspace", ".aiCollabData.json");
            const expectedJsonString = JSON.stringify(dataToSave, null, 2);
            // Act
            await (0, extension_1.saveInitialData)(dataToSave);
            // Assert
            // Check if our fake writeFile was called correctly
            (0, vitest_1.expect)(fs.writeFile).toHaveBeenCalledWith(expectedPath, expectedJsonString, "utf-8");
        });
    });
    (0, vitest_1.describe)("createPromptForProject", () => {
        // Setup mock data we can reuse in our tests
        const mockUsers = [
            { id: "1", name: "Alice", skills: "React, Node.js" },
            { id: "2", name: "Bob", skills: "Python, Django" },
            { id: "3", name: "Charlie", skills: "DevOps, AWS" },
        ];
        (0, vitest_1.it)("should return an empty string if the project is null or undefined", () => {
            // Act: Call the function with invalid input
            const prompt = (0, extension_1.createPromptForProject)(null, mockUsers);
            // Assert: Expect a specific "safe" output
            (0, vitest_1.expect)(prompt).toBe("");
        });
        (0, vitest_1.it)("should include the project name and details of selected members", () => {
            // Arrange
            const mockProject = {
                name: "Super Secret Project",
                description: "A test description.",
                goals: "A test goal.",
                requirements: "A test requirement.",
                selectedMemberIds: ["1", "3"], // Alice and Charlie
            };
            // Act
            const prompt = (0, extension_1.createPromptForProject)(mockProject, mockUsers);
            // Assert
            (0, vitest_1.expect)(prompt).toContain("Project Name: Super Secret Project");
            (0, vitest_1.expect)(prompt).toContain("Name: Alice");
            (0, vitest_1.expect)(prompt).toContain("Skills: DevOps, AWS"); // Charlie's skill
            // This is a crucial assertion!
            (0, vitest_1.expect)(prompt).not.toContain("Name: Bob"); // Bob was NOT selected
        });
    });
});
