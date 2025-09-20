---
sidebar_position: 1
---

# System Overview

## Project Abstract

This VS Code Extension will give users the ability to create projects and describe them, so that an AI-powered agent can delegate responsibilities between the team members. So that every team member knows exactly what to do according to their known skills and the programming languages they can manage. That way, every team member is working towards the same goal but has different specialized responsibilities. The agent takes the role of leadership in helping all the team members work in unison, but without working on the same requirement for the project. This avoids lost time and problems in development, and the Agent is also able to give suggestions on the code each member is working on as well as after the section is complete. 

## Conceptual Design

The proposed VS Code extension will be developed using TypeScript, HTML, and CSS. TypeScript will handle the core functionality and logic of the extension, while HTML and CSS will be used to build and style the user interface. The UI will allow users to create and describe projects, view assigned tasks, interact with a chatbot agent, and track progress through a project dashboard.

Users will log in through GitHub authentication, during which they can provide details about their technical skills and learning goals. This information will help the AI agent intelligently allocate tasks based on individual capabilities and preferences.

Real-time collaboration will be supported through integration with Visual Studio Live Share, enabling multiple users to work on the same codebase simultaneously. Team communication and feedback will be gathered through commit messages and comment threads, which the agent will analyze to generate context-aware suggestions and high-level project guidance.

The AI agent, powered by OpenAI, will be hosted remotely and accessed through API calls. It will assist with task delegation, provide real-time code feedback, and guide project planning based on team interactions.

A built-in dashboard, designed as a VS Code popup component, will visually present project steps, assigned tasks, and a chat interface for communicating with the agent. All relevant data, including user profiles, project metadata, and interaction logs, will be securely stored and managed using Supabase as the backend service.

## Background 

AI-powered code assistants like OpenAI's Chat GPT and Github's Copilot have revolutionized software development, enabling programmers to write code faster and with fewer errors. However, they are still hindered by poor communication in teams. These programmers will work on the same project and while being efficient programming they waste time with merge conflicts and bugs. This leads to a lot of time wasted, and a lot of issues outside the code itself. Our project is trying to address this by implementing a system that distributes roles to a team and keeps live updates on the code. With this approach we hope that AI coding assistance can be used for more than just improved programming, and can be used for more collaborative projects.
