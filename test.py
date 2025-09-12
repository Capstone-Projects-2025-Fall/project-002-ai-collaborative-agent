import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, filedialog
import json
import os
from datetime import datetime

class User:
    """Class to store user information"""
    def __init__(self, name, skills, programming_languages, willing_to_work_on):
        self.name = name
        self.skills = skills
        self.programming_languages = programming_languages
        self.willing_to_work_on = willing_to_work_on
    
    def to_dict(self):
        """Convert user to dictionary for JSON serialization"""
        return {
            'name': self.name,
            'skills': self.skills,
            'programming_languages': self.programming_languages,
            'willing_to_work_on': self.willing_to_work_on
        }
    
    @classmethod
    def from_dict(cls, data):
        """Create user from dictionary"""
        return cls(data['name'], data['skills'], data['programming_languages'], data['willing_to_work_on'])
    
    def __str__(self):
        return f"Name: {self.name}\nSkills: {self.skills}\nProgramming Languages: {self.programming_languages}\nWilling to work on: {self.willing_to_work_on}"

class Project:
    """Class to store project information"""
    def __init__(self, name, description, goals, requirements, selected_users=None):
        self.name = name
        self.description = description
        self.goals = goals
        self.requirements = requirements
        self.selected_users = selected_users or []
        self.created_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    def to_dict(self):
        """Convert project to dictionary for JSON serialization"""
        return {
            'name': self.name,
            'description': self.description,
            'goals': self.goals,
            'requirements': self.requirements,
            'selected_users': [user.to_dict() for user in self.selected_users],
            'created_date': self.created_date
        }
    
    def __str__(self):
        users_str = ", ".join([user.name for user in self.selected_users])
        return f"Project: {self.name}\nDescription: {self.description}\nGoals: {self.goals}\nRequirements: {self.requirements}\nTeam Members: {users_str}\nCreated: {self.created_date}"

class UserInfoGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("User Information & Project Manager")
        self.root.geometry("800x700")
        
        # Lists to store objects
        self.users = []
        self.projects = []
        
        # File paths
        self.users_file = "users_data.json"
        self.projects_file = "projects_data.json"
        
        self.setup_ui()
        self.load_data()
    
    def setup_ui(self):
        # Create notebook for tabs
        notebook = ttk.Notebook(self.root)
        notebook.pack(expand=True, fill='both', padx=10, pady=10)
        
        # Users tab
        self.users_frame = ttk.Frame(notebook)
        notebook.add(self.users_frame, text="Users")
        self.setup_users_tab()
        
        # Projects tab
        self.projects_frame = ttk.Frame(notebook)
        notebook.add(self.projects_frame, text="Projects")
        self.setup_projects_tab()
        
        # AI Prompt tab
        self.prompt_frame = ttk.Frame(notebook)
        notebook.add(self.prompt_frame, text="AI Prompt Generator")
        self.setup_prompt_tab()
    
    def setup_users_tab(self):
        # Main frame for users
        main_frame = ttk.Frame(self.users_frame, padding="10")
        main_frame.pack(expand=True, fill='both')
        
        # Name field
        ttk.Label(main_frame, text="Name:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.name_var = tk.StringVar()
        self.name_entry = ttk.Entry(main_frame, textvariable=self.name_var, width=50)
        self.name_entry.grid(row=0, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # Skills field
        ttk.Label(main_frame, text="Skills:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.skills_var = tk.StringVar()
        self.skills_entry = ttk.Entry(main_frame, textvariable=self.skills_var, width=50)
        self.skills_entry.grid(row=1, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # Programming Languages field
        ttk.Label(main_frame, text="Programming Languages:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.prog_lang_var = tk.StringVar()
        self.prog_lang_entry = ttk.Entry(main_frame, textvariable=self.prog_lang_var, width=50)
        self.prog_lang_entry.grid(row=2, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # Willing to work on field
        ttk.Label(main_frame, text="Willing to work on:").grid(row=3, column=0, sticky=(tk.W, tk.N), pady=5)
        self.willing_text = scrolledtext.ScrolledText(main_frame, width=50, height=5)
        self.willing_text.grid(row=3, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # Buttons frame
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=4, column=0, columnspan=2, pady=20)
        
        ttk.Button(button_frame, text="Add User", command=self.add_user).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Clear Form", command=self.clear_user_form).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Show All Users", command=self.show_users).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Save to File", command=self.save_users_to_file).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Generate Users String", command=self.generate_users_string).pack(side=tk.LEFT, padx=5)
        
        # Status label
        self.user_status_var = tk.StringVar()
        self.user_status_var.set("Ready to add users")
        ttk.Label(main_frame, textvariable=self.user_status_var).grid(row=5, column=0, columnspan=2, pady=10)
        
        # Configure grid weights
        main_frame.columnconfigure(1, weight=1)
        self.name_entry.focus()
    
    def setup_projects_tab(self):
        main_frame = ttk.Frame(self.projects_frame, padding="10")
        main_frame.pack(expand=True, fill='both')
        
        # Project name
        ttk.Label(main_frame, text="Project Name:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.project_name_var = tk.StringVar()
        ttk.Entry(main_frame, textvariable=self.project_name_var, width=50).grid(row=0, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # Project description
        ttk.Label(main_frame, text="Description:").grid(row=1, column=0, sticky=(tk.W, tk.N), pady=5)
        self.project_desc_text = scrolledtext.ScrolledText(main_frame, width=50, height=4)
        self.project_desc_text.grid(row=1, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # Project goals
        ttk.Label(main_frame, text="Goals:").grid(row=2, column=0, sticky=(tk.W, tk.N), pady=5)
        self.project_goals_text = scrolledtext.ScrolledText(main_frame, width=50, height=4)
        self.project_goals_text.grid(row=2, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # Project requirements
        ttk.Label(main_frame, text="Requirements:").grid(row=3, column=0, sticky=(tk.W, tk.N), pady=5)
        self.project_req_text = scrolledtext.ScrolledText(main_frame, width=50, height=4)
        self.project_req_text.grid(row=3, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # User selection
        ttk.Label(main_frame, text="Select Team Members:").grid(row=4, column=0, sticky=(tk.W, tk.N), pady=5)
        
        # Frame for user selection
        user_select_frame = ttk.Frame(main_frame)
        user_select_frame.grid(row=4, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # Listbox with scrollbar for user selection
        listbox_frame = ttk.Frame(user_select_frame)
        listbox_frame.pack(fill='both', expand=True)
        
        self.users_listbox = tk.Listbox(listbox_frame, selectmode=tk.MULTIPLE, height=6)
        scrollbar = ttk.Scrollbar(listbox_frame, orient="vertical", command=self.users_listbox.yview)
        self.users_listbox.configure(yscrollcommand=scrollbar.set)
        
        self.users_listbox.pack(side=tk.LEFT, fill='both', expand=True)
        scrollbar.pack(side=tk.RIGHT, fill='y')
        
        # Refresh users button
        ttk.Button(user_select_frame, text="Refresh Users List", command=self.refresh_users_list).pack(pady=5)
        
        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=5, column=0, columnspan=2, pady=20)
        
        ttk.Button(button_frame, text="Create Project", command=self.create_project).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Clear Form", command=self.clear_project_form).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Show All Projects", command=self.show_projects).pack(side=tk.LEFT, padx=5)
        
        # Status label
        self.project_status_var = tk.StringVar()
        self.project_status_var.set("Ready to create projects")
        ttk.Label(main_frame, textvariable=self.project_status_var).grid(row=6, column=0, columnspan=2, pady=10)
        
        main_frame.columnconfigure(1, weight=1)
        self.refresh_users_list()
    
    def setup_prompt_tab(self):
        main_frame = ttk.Frame(self.prompt_frame, padding="10")
        main_frame.pack(expand=True, fill='both')
        
        # Project selection
        ttk.Label(main_frame, text="Select Project for AI Prompt:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.project_combo = ttk.Combobox(main_frame, width=47, state="readonly")
        self.project_combo.grid(row=0, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # Refresh and Generate buttons
        button_frame1 = ttk.Frame(main_frame)
        button_frame1.grid(row=1, column=0, columnspan=2, pady=10)
        
        ttk.Button(button_frame1, text="Refresh Projects", command=self.refresh_projects_combo).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame1, text="Generate AI Prompt", command=self.generate_ai_prompt).pack(side=tk.LEFT, padx=5)
        
        # Text area label
        ttk.Label(main_frame, text="Generated AI Prompt:").grid(row=2, column=0, columnspan=2, sticky=tk.W, pady=(20, 5))
        
        # Text area for generated prompt
        self.prompt_text = scrolledtext.ScrolledText(main_frame, width=80, height=25, wrap=tk.WORD)
        self.prompt_text.grid(row=3, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        
        # Copy and save buttons
        button_frame2 = ttk.Frame(main_frame)
        button_frame2.grid(row=4, column=0, columnspan=2, pady=10)
        
        ttk.Button(button_frame2, text="Copy to Clipboard", command=self.copy_prompt).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame2, text="Save Prompt to File", command=self.save_prompt).pack(side=tk.LEFT, padx=5)
        
        # Configure grid weights for resizing
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(3, weight=1)
        self.refresh_projects_combo()
    
    def add_user(self):
        """Add a new user with the entered information"""
        name = self.name_var.get().strip()
        skills = self.skills_var.get().strip()
        programming_languages = self.prog_lang_var.get().strip()
        willing_to_work_on = self.willing_text.get("1.0", tk.END).strip()
        
        if not name or not skills or not programming_languages:
            messagebox.showerror("Error", "Please fill in all required fields")
            return
        
        new_user = User(name, skills, programming_languages, willing_to_work_on)
        self.users.append(new_user)
        
        self.user_status_var.set(f"User '{name}' added successfully! Total users: {len(self.users)}")
        self.clear_user_form()
        self.refresh_users_list()
        self.save_data()
        messagebox.showinfo("Success", f"User '{name}' has been added successfully!")
    
    def clear_user_form(self):
        """Clear all user form fields"""
        self.name_var.set("")
        self.skills_var.set("")
        self.prog_lang_var.set("")
        self.willing_text.delete("1.0", tk.END)
        self.name_entry.focus()
    
    def show_users(self):
        """Display all users in a new window"""
        if not self.users:
            messagebox.showinfo("No Users", "No users have been added yet.")
            return
        
        users_window = tk.Toplevel(self.root)
        users_window.title("All Users")
        users_window.geometry("600x500")
        
        text_area = scrolledtext.ScrolledText(users_window, wrap=tk.WORD)
        text_area.pack(expand=True, fill='both', padx=10, pady=10)
        
        for i, user in enumerate(self.users, 1):
            text_area.insert(tk.END, f"=== User {i} ===\n{user}\n\n")
        
        text_area.config(state=tk.DISABLED)
    
    def save_users_to_file(self):
        """Save users to a text file"""
        if not self.users:
            messagebox.showwarning("No Data", "No users to save.")
            return
        
        filename = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
            title="Save Users to File"
        )
        
        if filename:
            try:
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write(f"Users Data - Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                    f.write("=" * 60 + "\n\n")
                    
                    for i, user in enumerate(self.users, 1):
                        f.write(f"User {i}:\n")
                        f.write(str(user))
                        f.write("\n\n" + "-" * 40 + "\n\n")
                
                messagebox.showinfo("Success", f"Users saved to {filename}")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to save file: {str(e)}")
    
    def generate_users_string(self):
        """Generate a single concatenated string of all users for prompt engineering"""
        if not self.users:
            messagebox.showwarning("No Data", "No users to generate string from.")
            return
        
        users_string = "TEAM MEMBERS INFORMATION:\n\n"
        
        for i, user in enumerate(self.users, 1):
            users_string += f"Team Member {i}:\n"
            users_string += f"Name: {user.name}\n"
            users_string += f"Skills: {user.skills}\n"
            users_string += f"Programming Languages: {user.programming_languages}\n"
            users_string += f"Willing to work on: {user.willing_to_work_on}\n"
            users_string += "\n"
        
        # Show in a new window
        string_window = tk.Toplevel(self.root)
        string_window.title("Generated Users String")
        string_window.geometry("600x500")
        
        text_area = scrolledtext.ScrolledText(string_window, wrap=tk.WORD)
        text_area.pack(expand=True, fill='both', padx=10, pady=10)
        text_area.insert("1.0", users_string)
        
        # Add copy button
        ttk.Button(string_window, text="Copy to Clipboard", 
                  command=lambda: self.copy_to_clipboard(users_string)).pack(pady=10)
    
    def create_project(self):
        """Create a new project"""
        name = self.project_name_var.get().strip()
        description = self.project_desc_text.get("1.0", tk.END).strip()
        goals = self.project_goals_text.get("1.0", tk.END).strip()
        requirements = self.project_req_text.get("1.0", tk.END).strip()
        
        if not name or not description:
            messagebox.showerror("Error", "Please fill in project name and description")
            return
        
        # Get selected users
        selected_indices = self.users_listbox.curselection()
        selected_users = [self.users[i] for i in selected_indices]
        
        if not selected_users:
            messagebox.showerror("Error", "Please select at least one team member")
            return
        
        new_project = Project(name, description, goals, requirements, selected_users)
        self.projects.append(new_project)
        
        self.project_status_var.set(f"Project '{name}' created successfully! Total projects: {len(self.projects)}")
        self.clear_project_form()
        self.refresh_projects_combo()
        self.save_data()
        messagebox.showinfo("Success", f"Project '{name}' has been created successfully!")
    
    def clear_project_form(self):
        """Clear all project form fields"""
        self.project_name_var.set("")
        self.project_desc_text.delete("1.0", tk.END)
        self.project_goals_text.delete("1.0", tk.END)
        self.project_req_text.delete("1.0", tk.END)
        self.users_listbox.selection_clear(0, tk.END)
    
    def show_projects(self):
        """Display all projects in a new window"""
        if not self.projects:
            messagebox.showinfo("No Projects", "No projects have been created yet.")
            return
        
        projects_window = tk.Toplevel(self.root)
        projects_window.title("All Projects")
        projects_window.geometry("700x600")
        
        text_area = scrolledtext.ScrolledText(projects_window, wrap=tk.WORD)
        text_area.pack(expand=True, fill='both', padx=10, pady=10)
        
        for i, project in enumerate(self.projects, 1):
            text_area.insert(tk.END, f"=== Project {i} ===\n{project}\n\n")
        
        text_area.config(state=tk.DISABLED)
    
    def refresh_users_list(self):
        """Refresh the users listbox"""
        self.users_listbox.delete(0, tk.END)
        for user in self.users:
            self.users_listbox.insert(tk.END, f"{user.name} - {user.skills}")
    
    def refresh_projects_combo(self):
        """Refresh the projects combobox"""
        project_names = [project.name for project in self.projects]
        self.project_combo['values'] = project_names
        if project_names and not self.project_combo.get():
            self.project_combo.current(0)
    
    def generate_ai_prompt(self):
        """Generate comprehensive AI prompt for selected project"""
        if not self.projects:
            messagebox.showwarning("No Projects", "No projects available. Create a project first.")
            return
        
        selected_project_name = self.project_combo.get()
        if not selected_project_name:
            messagebox.showwarning("No Selection", "Please select a project.")
            return
        
        # Find the selected project
        selected_project = next((p for p in self.projects if p.name == selected_project_name), None)
        if not selected_project:
            messagebox.showerror("Error", "Selected project not found.")
            return
        
        # Generate comprehensive prompt
        prompt = self.create_comprehensive_prompt(selected_project)
        
        # Display in text area
        self.prompt_text.delete("1.0", tk.END)
        self.prompt_text.insert("1.0", prompt)
    
    def create_comprehensive_prompt(self, project):
        """Create a comprehensive AI prompt for the project"""
        prompt = f"""PROJECT ANALYSIS AND TEAM OPTIMIZATION REQUEST

=== PROJECT INFORMATION ===
Project Name: {project.name}
Created: {project.created_date}

Project Description:
{project.description}

Project Goals:
{project.goals}

Project Requirements:
{project.requirements}

=== TEAM COMPOSITION ===
Team Size: {len(project.selected_users)} members

"""
        
        # Add detailed team member information
        for i, user in enumerate(project.selected_users, 1):
            prompt += f"""Team Member {i}:
Name: {user.name}
Skills: {user.skills}
Programming Languages: {user.programming_languages}
Willing to work on: {user.willing_to_work_on}

"""
        
        # Add AI instruction section
        prompt += """=== AI ANALYSIS REQUEST ===

Please analyze this project and team composition and provide:

1. TEAM ANALYSIS:
   - Evaluate if the current team has the right skill mix for the project requirements
   - Identify any skill gaps or redundancies
   - Assess team member compatibility based on their stated interests

2. PROJECT FEASIBILITY:
   - Analyze if the project goals are achievable with the current team
   - Identify potential challenges based on requirements vs. available skills
   - Suggest timeline considerations

3. ROLE ASSIGNMENTS:
   - Recommend specific roles for each team member based on their skills
   - Suggest who should lead different aspects of the project
   - Identify collaboration opportunities between team members

4. OPTIMIZATION RECOMMENDATIONS:
   - Suggest additional skills that might be needed
   - Recommend training or resource allocation
   - Propose project structure and workflow improvements

5. RISK ASSESSMENT:
   - Identify potential project risks based on team composition
   - Suggest mitigation strategies
   - Highlight critical success factors

6. DELIVERABLES MAPPING:
   - Break down project requirements into specific deliverables
   - Map deliverables to team member capabilities
   - Suggest milestone structure

Please provide detailed, actionable insights that will help optimize this project's success rate and team performance."""

        return prompt
    
    def copy_prompt(self):
        """Copy the generated prompt to clipboard"""
        prompt = self.prompt_text.get("1.0", tk.END).strip()
        if prompt:
            self.root.clipboard_clear()
            self.root.clipboard_append(prompt)
            messagebox.showinfo("Success", "Prompt copied to clipboard!")
        else:
            messagebox.showwarning("No Content", "No prompt to copy. Generate a prompt first.")
    
    def save_prompt(self):
        """Save the generated prompt to a file"""
        prompt = self.prompt_text.get("1.0", tk.END).strip()
        if not prompt:
            messagebox.showwarning("No Content", "No prompt to save. Generate a prompt first.")
            return
        
        filename = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
            title="Save AI Prompt"
        )
        
        if filename:
            try:
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write(prompt)
                messagebox.showinfo("Success", f"Prompt saved to {filename}")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to save file: {str(e)}")
    
    def copy_to_clipboard(self, text):
        """Copy text to clipboard"""
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        messagebox.showinfo("Success", "Text copied to clipboard!")
    
    def save_data(self):
        """Save users and projects to JSON files"""
        try:
            # Save users
            with open(self.users_file, 'w', encoding='utf-8') as f:
                json.dump([user.to_dict() for user in self.users], f, indent=2, ensure_ascii=False)
            
            # Save projects
            with open(self.projects_file, 'w', encoding='utf-8') as f:
                json.dump([project.to_dict() for project in self.projects], f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving data: {e}")
    
    def load_data(self):
        """Load users and projects from JSON files"""
        try:
            # Load users
            if os.path.exists(self.users_file):
                with open(self.users_file, 'r', encoding='utf-8') as f:
                    users_data = json.load(f)
                    self.users = [User.from_dict(data) for data in users_data]
                    self.user_status_var.set(f"Loaded {len(self.users)} users from file")
            
            # Load projects
            if os.path.exists(self.projects_file):
                with open(self.projects_file, 'r', encoding='utf-8') as f:
                    projects_data = json.load(f)
                    for project_data in projects_data:
                        # Reconstruct users for each project
                        selected_users = [User.from_dict(user_data) for user_data in project_data['selected_users']]
                        project = Project(
                            project_data['name'],
                            project_data['description'],
                            project_data['goals'],
                            project_data['requirements'],
                            selected_users
                        )
                        project.created_date = project_data.get('created_date', datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                        self.projects.append(project)
                    
                    self.project_status_var.set(f"Loaded {len(self.projects)} projects from file")
            
            # Refresh UI elements
            self.refresh_users_list()
            self.refresh_projects_combo()
            
        except Exception as e:
            print(f"Error loading data: {e}")

def main():
    root = tk.Tk()
    app = UserInfoGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()