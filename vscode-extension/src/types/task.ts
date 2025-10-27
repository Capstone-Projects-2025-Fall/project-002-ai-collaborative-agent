// Defines the strict JSON we expect back from the AI edge function
// Keep this in sync with your Supabase `task-delegator` output
export type JiraIssueType = "Story" | "Task" | "Bug";
export type JiraPriority = "Highest" | "High" | "Medium" | "Low" | "Lowest";

export type Task = {
  // Title used as Jira summary
  title: string;
  // Longer details copied into Jira description
  description?: string;
  // Maps directly to Jira issue type
  type?: JiraIssueType;
  // Maps directly to Jira priority
  priority?: JiraPriority;
  // Optional Jira labels to tag the issue
  labels?: string[];
  // Optional story points (adjust custom field id in jira.ts)
  storyPoints?: number;
  // Shown as bullet points in the description
  acceptanceCriteria?: string[];
};

//new
export interface TaskItem {
  title: string;
  description: string;
  type: "Task" | "Story" | "Bug";
  priority?: "Highest" | "High" | "Medium" | "Low" | "Lowest";
  labels?: string[];
  storyPoints?: number;
  acceptanceCriteria?: string[];
}



export type TaskBacklog = {
  // Optional project name inferred by AI
  projectName?: string;
  // The tasks the AI wants us to create
  tasks: Task[];
};