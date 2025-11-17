---
sidebar_position: 4
---

# Features and Requirements

## Project & Team Management
This overarching feature encapsulates the core functionality for users to create projects, define the requirements, and assemble a team. It's the starting point for the other requirements.

### Functional Requirements (FRs)
  * Users must be able to create a new project, provide a name, description, and due date.
  * Users must be able to add team members to a project.
  * The system must allow users to input and save the skills and programming languages of each team member.
  * Users must be able to upload or manually enter project specifications, such as a Software Requirements Specification (SRS) document.

### Non-Functional Requirements (NFRs)
* (Usability): The user interface for creating teams and projects must be intuitive and easy to navigate.
* (Performance): The system must be able to handle the creation of projects and teams with a minimum of 100 members without significant lag.
* (Reliability): All project data, including member information and specifications, must be saved reliably to prevent data loss.

## Intelligent Project Agent
The agent acts as a smart assistant, analyzing project data and team member contributions to provide insights, deletage responsabilities and automate tasks.
### Functional Requirements (FRs)
* The agent must be able to analyze the project's specifications (SRS) and understand its requirements.
* The agent must be able to automatically delegate responsibilities and tasks to team members based on their skills and the project's requirements.
* The agent must be able to identify and highlight tasks that require the most attention or are behind schedule.
* The agent must be able to analyze code submitted by team members and compare it to identify duplicates, dependencies, or potential conflicts.
* The agent must be able to provide suggestions for the project's development based on its analysis of the SRS.
### Non-Functional Requirements (NFRs)
* (Accuracy): The agent's suggestions and analysis must be highly accurate, with a low error rate.
* (Performance): The agent's analysis and delegation processes must be completed in a timely manner to avoid project delays.
* (Security): The code and project data analyzed by the agent must be kept secure and confidential.

## Collaboration & Visibility
This feature focuses on the aspects of the system that enhance team collaboration and provide transparency into the project's progress. It allows team members to see what others are working on, preventing redundant work.
### Functional Requirements (FRs)
* The system must provide a real-time view of which files each team member is currently working on.
* After comparing code, the agent must be able to provide clear, actionable summaries for each team member, letting them know what their teammates are working on.
### Non-Functional Requirements (NFRs)
* (Real-Time): The updates on file activity must be near real-time to be useful for collaboration.
* (Usability): The visualization of team member activity and code comparisons must be easy to understand.
* (Scalability): The system must be able to maintain this real-time visibility for large teams without a drop in performance.

## User Authentication & Profiles
This feature provides the security and user identity management for the entire platform, ensuring each team member has a unique and secure account and that they can only see the projects which they are part of.
### Functional Requirements (FRs)
* Users must be able to create a new account with a unique username and password.
* The system must store user profile data, including their name, skills, and programming languages.
* Users must be able to log in to their account using their credentials.
### Non-Functional Requirements (NFRs)
* (Security): All user passwords must be securely hashed and stored to prevent unauthorized access.
* (Availability): The login system must be available 99.9% of the time.
* (Usability): The account creation and login process must be simple and straightforward for all users.

