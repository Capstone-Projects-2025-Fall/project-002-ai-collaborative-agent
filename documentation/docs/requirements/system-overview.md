---
sidebar_position: 1
---

# Project Abstract

This document proposes a VS Code Extension that will give users the ability to create projects and describe them, so that an AI-powered agent can delegate responsibilities between the team members. So that every team member knows exactly what to do according to their known skills and the programming languages they can manage. That way, every team member is working towards the same goal but has different specialized responsibilities. The agent takes the role of leadership in helping all the team members work in unison, but without working on the same requirement for the project. This avoids lost time and problems in development, and the Agent is also able to give suggestions on the code each member is working on as well as after the section is complete. 

# Conceptual Design
The frontend of the app will be built using JavaScript, React, HTML, and CSS. React will be used to build UI components and manage the state of the application, and JavaScript, HTML, and CSS will be used to create the User interface and handle User interactions. The backend will be built using Python and Django to handle User authentication and authorization, data storage, and the algorithms that determine how the extensions appearance changes based on the student's study habits. SQLite will be used to store the User's data, such as their study goals, progress, and rewards.

The VS Code Extension will be built using TypeScript, HTML and CSS. HTML and CSS will be used to style the UI where users will be able to create projects, describe them, and view task assignments.
 

# Background 
AI-powered code assistants like OpenAI's Chat GPT and Github's Copilot have revolutionized software development, enabling programmers to write code faster and with fewer errors. However, they are still hindered by poor communication in teams. These programmers will work on the same project and while being efficient programming they waste time with merge conflicts and bugs. This leads to a lot of time wasted, and a lot of issues outside the code itself. Our project is trying to address this by implementing a system that distributes roles to a team and keeps live updates on the code. With this approach we hope that AI coding assistance can be used for more than just improved programming, and can be used for more collaborative projects.
