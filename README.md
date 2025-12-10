<div align="center">

# Pallas AI

[![Report Issue on Jira](https://img.shields.io/badge/Report%20Issues-Jira-0052CC?style=flat&logo=jira-software)](https://temple-cis-projects-in-cs.atlassian.net/jira/software/c/projects/DT/issues)
[![Deploy Docs](https://github.com/ApplebaumIan/tu-cis-4398-docs-template/actions/workflows/deploy.yml/badge.svg)](https://github.com/ApplebaumIan/tu-cis-4398-docs-template/actions/workflows/deploy.yml)
[![Documentation Website Link](https://img.shields.io/badge/-Documentation%20Website-brightgreen)](https://capstone-projects-2025-fall.github.io/project-002-ai-collaborative-agent/)


</div>

## Keywords

AI, Agent, Project Organization, Collaborative Coding, VSCode Extention

## Project Abstract

This project proposes the development of a Visual Studio Code extension designed to streamline collaborative software development through AI-powered project management. The extension enables users to create and describe new projects, allowing an intelligent agent to analyze team member profiles, including their skill sets and preferred programming languages, and automatically assign tasks accordingly. By delegating responsibilities based on individual expertise, the system ensures that all team members contribute effectively toward a common objective, each focusing on distinct, specialized components. Acting as a virtual project lead, the AI agent coordinates efforts to prevent overlap, reduce development time, and minimize miscommunication. Additionally, the agent provides real-time coding suggestions and post-completion feedback, enhancing code quality and team productivity throughout the development lifecycle.

## High Level Requirement

The proposed VS Code extension enables students to create teams for specific programming problems, where an AI agent automatically allocates tasks based on each member’s skills. Team members can code simultaneously, with the agent providing real-time feedback informed by their teammates' work. Additionally, the agent synthesizes team feedback to generate high-level guidance, helping align the group on overall project goals and structure.

## Conceptual Design

The VS Code extension will be built using TypeScript, HTML, and CSS, with a user-friendly interface for creating projects, describing goals, and viewing assigned tasks. Users will log in via GitHub, submitting their skills and learning goals, which the AI agent, powered by OpenAI, uses to allocate work intelligently.

Live Share integration will enable real-time collaborative coding, while the agent analyzes commit messages and comment threads to provide context-aware feedback and high-level project guidance. A built-in dashboard, implemented as a popup within VS Code, will display project steps, task assignments, and include a chatbot interface. All project data and user interactions will be stored securely using Supabase.

## Background

As software development becomes increasingly collaborative, the ability to effectively coordinate tasks and share responsibilities among team members is critical, especially for students and early-career programmers learning to work in teams. Traditional project management tools often operate outside the development environment, causing context switching and reducing workflow efficiency. Meanwhile, students frequently face challenges in dividing responsibilities, understanding project scope, and aligning on high-level goals, especially when working remotely.

With the rise of intelligent coding assistants and collaborative tools like GitHub and Live Share, there is a growing opportunity to integrate AI-driven project guidance directly into the development environment. Leveraging these technologies can bridge the gap between learning and doing, helping teams not only write code together but also collaborate strategically, receive real-time feedback, and stay aligned on project objectives.

This project addresses these needs by introducing an AI-enhanced VS Code extension that helps teams create projects, distribute tasks based on skill sets, collaborate in real time, and receive feedback and high-level guidance, all within a single, familiar workspace. By embedding intelligent coordination directly into the development workflow, this tool aims to improve both the learning experience and productivity of collaborative coding teams.

## Required Resources

- Visual Studio Code with extension development tools
- TypeScript, HTML, and CSS for extension UI and logic
- GitHub OAuth for user authentication and profile data
- Visual Studio Live Share for real-time collaborative coding
- OpenAI API for AI-powered task allocation and feedback
- Supabase for backend data storage and management
- Jira Cloud account with a project key and API token for backlog sync
- Node.js dependencies for the Jira feature (installed via `npm install` in `vscode-extension`, including `node-fetch@2`)

## How to Run the Project

### Prerequisites

- Node.js (v16 or higher)
- Visual Studio Code (latest version)
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Capstone-Projects-2025-Fall/project-002-ai-collaborative-agent.git
cd project-002-ai-collaborative-agent
```

2. Download and install the Visual Studio Live Share extension for Visual Studio Code.

3. Wait for the extension to finish downloading and then reload VS Code when prompted.ss

4. Once complete, you'll see ```Live Share``` appear in your status bar.

5. Install root dependencies:
```bash
npm install
```

6. Install extension dependencies:
```bash
cd vscode-extension
npm install
```

7. Install the Jira REST client dependency (bundled with the extension install; run explicitly if you skipped step 6):
```bash
cd vscode-extension
npm install node-fetch@2
```

### Configuration

No configuration is required for local development. Supabase settings are embedded in the extension code, so a `.env` file is not needed.

### Running the Extension

1. Open the `vscode-extension` folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. In the new VS Code window, open any workspace
4. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
5. Type "AI Collab Agent: Open" and press Enter
   - If prompted to log in, follow the on-screen flow. No environment variables are required.

#### Join a Project via Invite Code

If you want to join an existing project from the UI using an invite code:

1. Open the extension panel (see steps above)
2. In the app UI, choose the option to join a project
3. Enter the invite code: `748FDF`
4. Confirm to join the project

#### Using Jira Backlog Sync (AI → Jira)

1. Open the extension panel and run **AI Analysis & Task Delegation** for a project.
2. Go to the **Jira** tab and enter your Jira base URL (e.g., `https://your-team.atlassian.net`), project key, Jira email, and API token.
3. Click **Use AI analysis output** to auto-fill the backlog prompt with delegated tasks.
4. Press **Create Jira Tasks** to push those tasks to Jira; use **Refresh tasks** to verify they appear on the board.

### Features

- **Team Management**: Add team members with their skills and programming languages
- **Project Creation**: Create projects with goals, requirements, and assign team members
- **AI Task Delegation**: Generate AI-powered task assignments based on team composition
- **Live Share Integration**: Start collaborative coding sessions
- **Code Analysis**: Automated code review and suggestions
- **Jira Backlog Sync**: Turn AI analysis output into Jira tasks, create/update issues, and refresh board status from Jira
- **AI Suggestion**: Triggers due to a manual call or if certain criteria is met, and suggests a team member in team that has the skills to help fix the issue

### Bugs

- Jira feature didn't work with final merges
- AI Suggestion bugged due to final merges as well
- Sidebar didn't work properly on final main


### Testing

- Run all extension tests:
  ```bash
  cd vscode-extension
  npm run test
  ```
- Run only the Jira helper tests (task parsing and Jira API calls):
  ```bash
  cd vscode-extension
  npm run test -- src/lib/jira.test.ts
  ```

## Collaborators

<div align="center">

Thomas Ignacio Ishida, Reza Khoshnabish, Abdoul F. Djedje, Jaeden Lee, Natanim Abebe, Junrong Chen, Morgan Butler, Zachary Ngo

</div>
