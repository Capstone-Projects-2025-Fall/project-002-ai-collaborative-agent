<div align="center">

# AI Collab Agent

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

### Configuration

No configuration is required for local development. Supabase settings are embedded in the extension code, so a `.env` file is not needed.

### Running the Extension

1. Open the `vscode-extension` folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. In the new VS Code window, open any workspace
4. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
5. Type "AI Collab Agent: Open" and press Enter
   - If prompted to log in, follow the on-screen flow. No environment variables are required.

### Jira Tasks Feature

#### Additional prerequisites
- Atlassian/Jira Cloud site URL (e.g., `https://your-team.atlassian.net`) and an existing project key (e.g., `TEAM`).
- Jira account email that has access to the project.
- Jira API token (create at https://id.atlassian.com/manage/api-tokens).
- Extension dependencies installed in `vscode-extension` (handled by `npm install`), which include `@supabase/supabase-js`, `axios`, `node-fetch`, `vsls`, and `dotenv`.

#### Setup & usage
1. Install dependencies if you haven’t already:
   ```bash
   npm install
   cd vscode-extension
   npm install
   cd ..
   ```
2. Launch the extension (`F5`) and open the AI Collab panel.
3. Go to the Jira tab and enter:
   - Jira Base URL
   - Jira Project Key
   - Jira Email
   - Jira API Token
   - (Optional) Jira Project Prompt for backlog generation
4. Click **Create Jira Tasks** (or run the `AI: Create Jira Tasks` command) to generate a backlog from your prompt.
5. Use **Refresh tasks** to pull the Jira board, create/update/delete tasks, or add assignable emails to map teammates to Jira accounts.
6. Use **Jump to tasks** to scroll to the board view; filter/search tasks as needed.

#### Join a Project via Invite Code

If you want to join an existing project from the UI using an invite code:

1. Open the extension panel (see steps above)
2. In the app UI, choose the option to join a project
3. Enter the invite code: `748FDF`
4. Confirm to join the project

### Features

- **Team Management**: Add team members with their skills and programming languages
- **Project Creation**: Create projects with goals, requirements, and assign team members
- **AI Task Delegation**: Generate AI-powered task assignments based on team composition
- **Jira Integration**: Connect your Jira workspace, generate backlog items from prompts, and manage issues (create/update/delete, assign, transition) directly in the extension
- **Live Share Integration**: Start collaborative coding sessions
- **Code Analysis**: Automated code review and suggestions

## Collaborators

<div align="center">

Thomas Ignacio Ishida, Reza Khoshnabish, Abdoul F. Djedje, Jaeden Lee, Natanim Abebe, Junrong Chen, Morgan Butler, Zachary Ngo

</div>
