"use strict";
// extension.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
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
// --- Test Suite ---
(0, vitest_1.describe)("AI Prompt Generation", () => {
    // This runs before each 'it' block, resetting our mocks
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)("generateAIPrompt", () => {
        (0, vitest_1.it)("should generate a prompt with project and member information", () => {
            // Arrange
            const mockProject = {
                name: "Test Project",
                description: "A test project",
                goals: "Test goals",
                requirements: "Test requirements"
            };
            const mockMembers = [
                { name: "Alice", skills: ["React", "Node.js"] },
                { name: "Bob", skills: ["Python", "Django"] }
            ];
            // Act
            const prompt = (0, extension_1.generateAIPrompt)(mockProject, mockMembers);
            // Assert
            (0, vitest_1.expect)(prompt).toContain("Test Project");
            (0, vitest_1.expect)(prompt).toContain("Alice");
            (0, vitest_1.expect)(prompt).toContain("Bob");
            (0, vitest_1.expect)(prompt).toContain("React");
            (0, vitest_1.expect)(prompt).toContain("Python");
        });
        (0, vitest_1.it)("should handle empty members array", () => {
            // Arrange
            const mockProject = {
                name: "Test Project",
                description: "A test project",
                goals: "Test goals",
                requirements: "Test requirements"
            };
            const mockMembers = [];
            // Act
            const prompt = (0, extension_1.generateAIPrompt)(mockProject, mockMembers);
            // Assert
            (0, vitest_1.expect)(prompt).toContain("Test Project");
            (0, vitest_1.expect)(prompt).toContain("No team members selected");
        });
    });
});
