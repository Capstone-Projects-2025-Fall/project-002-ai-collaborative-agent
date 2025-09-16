import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, filedialog
import json
import os
import hashlib
import requests
import webbrowser
import urllib.parse
from datetime import datetime
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import secrets
import base64

class GitHubOAuthHandler(BaseHTTPRequestHandler):
    """HTTP handler for GitHub OAuth callback"""
    
    def do_GET(self):
        """Handle GET request from GitHub OAuth callback"""
        if self.path.startswith('/callback'):
            # Parse the authorization code from the callback URL
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            
            if 'code' in params:
                auth_code = params['code'][0]
                state = params.get('state', [None])[0]
                
                # Store the code for the main thread to process
                self.server.auth_code = auth_code
                self.server.auth_state = state
                
                # Send success response
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                
                success_html = """
                <html>
                    <head><title>GitHub Authentication Success</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
                        <h2>🎉 Authentication Successful!</h2>
                        <p>You can now close this window and return to the application.</p>
                        <script>
                            setTimeout(function() {
                                window.close();
                            }, 3000);
                        </script>
                    </body>
                </html>
                """
                self.wfile.write(success_html.encode())
            else:
                # Handle error
                error = params.get('error', ['Unknown error'])[0]
                self.server.auth_error = error
                
                self.send_response(400)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                
                error_html = f"""
                <html>
                    <head><title>GitHub Authentication Error</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
                        <h2>❌ Authentication Failed</h2>
                        <p>Error: {error}</p>
                        <p>Please close this window and try again.</p>
                    </body>
                </html>
                """
                self.wfile.write(error_html.encode())
        
        # Signal that we've received a response
        self.server.callback_received = True
    
    def log_message(self, format, *args):
        """Suppress log messages"""
        pass

class AuthUser:
    """Class to store authenticated user login information"""
    def __init__(self, username, github_id=None, full_name="", email="", avatar_url="", auth_type="local"):
        self.username = username
        self.github_id = github_id
        self.full_name = full_name
        self.email = email
        self.avatar_url = avatar_url
        self.auth_type = auth_type  # "local" or "github"
        self.created_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.password_hash = None  # Only for local accounts
    
    def to_dict(self):
        return {
            'username': self.username,
            'github_id': self.github_id,
            'full_name': self.full_name,
            'email': self.email,
            'avatar_url': self.avatar_url,
            'auth_type': self.auth_type,
            'created_date': self.created_date,
            'password_hash': self.password_hash
        }
    
    @classmethod
    def from_dict(cls, data):
        user = cls(
            data['username'], 
            data.get('github_id'), 
            data.get('full_name', ''), 
            data.get('email', ''), 
            data.get('avatar_url', ''),
            data.get('auth_type', 'local')
        )
        user.created_date = data.get('created_date', datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        user.password_hash = data.get('password_hash')
        return user

class User:
    """Class to store user information"""
    def __init__(self, name, skills, programming_languages, willing_to_work_on, username=None):
        self.name = name
        self.skills = skills
        self.programming_languages = programming_languages
        self.willing_to_work_on = willing_to_work_on
        self.username = username  # Link to auth user
    
    def to_dict(self):
        return {
            'name': self.name,
            'skills': self.skills,
            'programming_languages': self.programming_languages,
            'willing_to_work_on': self.willing_to_work_on,
            'username': self.username
        }
    
    @classmethod
    def from_dict(cls, data):
        return cls(data['name'], data['skills'], data['programming_languages'], 
                  data['willing_to_work_on'], data.get('username'))
    
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
        return {
            'name': self.name,
            'description': self.description,
            'goals': self.goals,
            'requirements': self.requirements,
            'selected_users': [user.to_dict() for user in self.selected_users],
            'created_date': self.created_date
        }
    
    def get_user_projects(self, username):
        """Check if user is part of this project"""
        return any(user.username == username for user in self.selected_users)
    
    def __str__(self):
        users_str = ", ".join([user.name for user in self.selected_users])
        return f"Project: {self.name}\nDescription: {self.description}\nGoals: {self.goals}\nRequirements: {self.requirements}\nTeam Members: {users_str}\nCreated: {self.created_date}"

class GitHubAuthConfig:
    """GitHub OAuth configuration"""
    def __init__(self):
        self.client_id = ""
        self.client_secret = ""
        self.redirect_uri = "http://localhost:8000/callback"
        self.scope = "read:user user:email"
        
        # Load from config file if exists
        self.load_config()
    
    def load_config(self):
        """Load GitHub OAuth config from file"""
        try:
            if os.path.exists("github_config.json"):
                with open("github_config.json", 'r') as f:
                    config = json.load(f)
                    self.client_id = config.get('client_id', '')
                    self.client_secret = config.get('client_secret', '')
                    self.redirect_uri = config.get('redirect_uri', self.redirect_uri)
                    self.scope = config.get('scope', self.scope)
        except Exception as e:
            print(f"Error loading GitHub config: {e}")
    
    def save_config(self):
        """Save GitHub OAuth config to file"""
        try:
            config = {
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'redirect_uri': self.redirect_uri,
                'scope': self.scope
            }
            with open("github_config.json", 'w') as f:
                json.dump(config, f, indent=2)
        except Exception as e:
            print(f"Error saving GitHub config: {e}")

class LoginWindow:
    """Login window class with GitHub OAuth support"""
    def __init__(self, parent_app):
        self.parent_app = parent_app
        self.github_config = GitHubAuthConfig()
        
        self.window = tk.Toplevel()
        self.window.title("Login / Register")
        self.window.geometry("500x400")
        self.window.grab_set()  # Make modal
        self.window.protocol("WM_DELETE_WINDOW", self.on_close)
        
        self.current_user = None
        self.oauth_state = None
        self.oauth_server = None
        
        self.setup_ui()
    
    def setup_ui(self):
        main_frame = ttk.Frame(self.window, padding="20")
        main_frame.pack(expand=True, fill='both')
        
        # Title
        title_label = ttk.Label(main_frame, text="Team Collaboration Platform", font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 20))
        
        # GitHub Login Section
        github_frame = ttk.LabelFrame(main_frame, text="GitHub Authentication", padding="15")
        github_frame.pack(fill='x', pady=(0, 20))
        
        # GitHub login button
        github_btn_frame = ttk.Frame(github_frame)
        github_btn_frame.pack(fill='x')
        
        self.github_login_btn = ttk.Button(
            github_btn_frame, 
            text="🐙 Sign in with GitHub", 
            command=self.github_login,
            width=30
        )
        self.github_login_btn.pack(pady=10)
        
        # GitHub config button
        ttk.Button(
            github_btn_frame, 
            text="⚙️ Configure GitHub OAuth", 
            command=self.show_github_config,
            width=30
        ).pack(pady=5)
        
        # Status label for GitHub
        self.github_status = ttk.Label(github_frame, text="", foreground='blue')
        self.github_status.pack()
        
        # Separator
        separator = ttk.Separator(main_frame, orient='horizontal')
        separator.pack(fill='x', pady=20)
        
        # Local Account Section
        local_frame = ttk.LabelFrame(main_frame, text="Local Account (Fallback)", padding="15")
        local_frame.pack(fill='x')
        
        # Notebook for login/register tabs
        notebook = ttk.Notebook(local_frame)
        notebook.pack(expand=True, fill='both')
        
        # Login tab
        login_frame = ttk.Frame(notebook, padding="10")
        notebook.add(login_frame, text="Login")
        
        ttk.Label(login_frame, text="Username:").pack(anchor='w', pady=2)
        self.login_username = tk.StringVar()
        ttk.Entry(login_frame, textvariable=self.login_username, width=30).pack(pady=2)
        
        ttk.Label(login_frame, text="Password:").pack(anchor='w', pady=2)
        self.login_password = tk.StringVar()
        ttk.Entry(login_frame, textvariable=self.login_password, show="*", width=30).pack(pady=2)
        
        ttk.Button(login_frame, text="Login", command=self.local_login).pack(pady=10)
        
        # Register tab
        register_frame = ttk.Frame(notebook, padding="10")
        notebook.add(register_frame, text="Register")
        
        ttk.Label(register_frame, text="Username:").pack(anchor='w', pady=1)
        self.reg_username = tk.StringVar()
        ttk.Entry(register_frame, textvariable=self.reg_username, width=30).pack(pady=1)
        
        ttk.Label(register_frame, text="Password:").pack(anchor='w', pady=1)
        self.reg_password = tk.StringVar()
        ttk.Entry(register_frame, textvariable=self.reg_password, show="*", width=30).pack(pady=1)
        
        ttk.Label(register_frame, text="Confirm Password:").pack(anchor='w', pady=1)
        self.reg_confirm = tk.StringVar()
        ttk.Entry(register_frame, textvariable=self.reg_confirm, show="*", width=30).pack(pady=1)
        
        ttk.Label(register_frame, text="Full Name:").pack(anchor='w', pady=1)
        self.reg_fullname = tk.StringVar()
        ttk.Entry(register_frame, textvariable=self.reg_fullname, width=30).pack(pady=1)
        
        ttk.Label(register_frame, text="Email:").pack(anchor='w', pady=1)
        self.reg_email = tk.StringVar()
        ttk.Entry(register_frame, textvariable=self.reg_email, width=30).pack(pady=1)
        
        ttk.Button(register_frame, text="Register", command=self.local_register).pack(pady=5)
        
        # Update GitHub status
        self.update_github_status()
    
    def update_github_status(self):
        """Update GitHub configuration status"""
        if self.github_config.client_id and self.github_config.client_secret:
            self.github_status.config(text="✅ GitHub OAuth configured", foreground='green')
        else:
            self.github_status.config(text="⚠️ GitHub OAuth not configured", foreground='orange')
    
    def show_github_config(self):
        """Show GitHub OAuth configuration dialog"""
        config_window = tk.Toplevel(self.window)
        config_window.title("GitHub OAuth Configuration")
        config_window.geometry("600x400")
        config_window.grab_set()
        
        main_frame = ttk.Frame(config_window, padding="20")
        main_frame.pack(expand=True, fill='both')
        
        # Instructions
        instructions = """
GitHub OAuth Setup Instructions:

1. Go to GitHub.com → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   • Application name: Your app name
   • Homepage URL: http://localhost:8000
   • Authorization callback URL: http://localhost:8000/callback
4. Click "Register application"
5. Copy the Client ID and Client Secret below
        """
        
        ttk.Label(main_frame, text=instructions, font=('Arial', 9)).pack(anchor='w', pady=(0, 20))
        
        # Client ID
        ttk.Label(main_frame, text="Client ID:").pack(anchor='w')
        client_id_var = tk.StringVar(value=self.github_config.client_id)
        ttk.Entry(main_frame, textvariable=client_id_var, width=60).pack(fill='x', pady=5)
        
        # Client Secret
        ttk.Label(main_frame, text="Client Secret:").pack(anchor='w', pady=(10, 0))
        client_secret_var = tk.StringVar(value=self.github_config.client_secret)
        ttk.Entry(main_frame, textvariable=client_secret_var, show="*", width=60).pack(fill='x', pady=5)
        
        # Redirect URI (read-only)
        ttk.Label(main_frame, text="Redirect URI (copy this to GitHub):").pack(anchor='w', pady=(10, 0))
        redirect_entry = ttk.Entry(main_frame, width=60)
        redirect_entry.pack(fill='x', pady=5)
        redirect_entry.insert(0, self.github_config.redirect_uri)
        redirect_entry.config(state='readonly')
        
        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(pady=20)
        
        def save_config():
            self.github_config.client_id = client_id_var.get().strip()
            self.github_config.client_secret = client_secret_var.get().strip()
            self.github_config.save_config()
            self.update_github_status()
            messagebox.showinfo("Success", "GitHub OAuth configuration saved!")
            config_window.destroy()
        
        def open_github():
            webbrowser.open("https://github.com/settings/developers")
        
        ttk.Button(button_frame, text="Open GitHub Settings", command=open_github).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Save Configuration", command=save_config).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancel", command=config_window.destroy).pack(side=tk.LEFT, padx=5)
    
    def github_login(self):
        """Initiate GitHub OAuth login"""
        if not self.github_config.client_id or not self.github_config.client_secret:
            messagebox.showerror("Configuration Error", "Please configure GitHub OAuth first")
            return
        
        try:
            # Generate state parameter for security
            self.oauth_state = secrets.token_urlsafe(32)
            
            # Start local server to handle callback
            self.start_oauth_server()
            
            # Build GitHub authorization URL
            auth_params = {
                'client_id': self.github_config.client_id,
                'redirect_uri': self.github_config.redirect_uri,
                'scope': self.github_config.scope,
                'state': self.oauth_state
            }
            
            auth_url = f"https://github.com/login/oauth/authorize?" + urllib.parse.urlencode(auth_params)
            
            # Open browser for authentication
            self.github_status.config(text="🌐 Opening browser for authentication...", foreground='blue')
            webbrowser.open(auth_url)
            
            # Start monitoring for callback
            self.monitor_oauth_callback()
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to initiate GitHub login: {str(e)}")
            self.github_status.config(text="❌ Login failed", foreground='red')
    
    def start_oauth_server(self):
        """Start local HTTP server for OAuth callback"""
        try:
            self.oauth_server = HTTPServer(('localhost', 8000), GitHubOAuthHandler)
            self.oauth_server.timeout = 1
            self.oauth_server.callback_received = False
            self.oauth_server.auth_code = None
            self.oauth_server.auth_state = None
            self.oauth_server.auth_error = None
            
            # Start server in a separate thread
            def run_server():
                while not self.oauth_server.callback_received:
                    self.oauth_server.handle_request()
            
            self.server_thread = threading.Thread(target=run_server, daemon=True)
            self.server_thread.start()
            
        except Exception as e:
            raise Exception(f"Failed to start OAuth callback server: {str(e)}")
    
    def monitor_oauth_callback(self):
        """Monitor for OAuth callback"""
        if hasattr(self, 'oauth_server') and self.oauth_server:
            if self.oauth_server.callback_received:
                self.handle_oauth_callback()
                return
        
        # Continue monitoring
        self.window.after(1000, self.monitor_oauth_callback)
    
    def handle_oauth_callback(self):
        """Handle OAuth callback and complete authentication"""
        try:
            if hasattr(self.oauth_server, 'auth_error') and self.oauth_server.auth_error:
                raise Exception(f"OAuth error: {self.oauth_server.auth_error}")
            
            if not hasattr(self.oauth_server, 'auth_code') or not self.oauth_server.auth_code:
                raise Exception("No authorization code received")
            
            # Verify state parameter
            if hasattr(self.oauth_server, 'auth_state'):
                if self.oauth_server.auth_state != self.oauth_state:
                    raise Exception("Invalid state parameter - possible CSRF attack")
            
            # Exchange authorization code for access token
            self.github_status.config(text="🔄 Exchanging code for access token...", foreground='blue')
            access_token = self.exchange_code_for_token(self.oauth_server.auth_code)
            
            # Get user information from GitHub
            self.github_status.config(text="👤 Fetching user information...", foreground='blue')
            github_user = self.get_github_user_info(access_token)
            
            # Create or update user account
            auth_user = self.create_or_update_github_user(github_user)
            
            # Complete login
            self.current_user = auth_user.username
            self.parent_app.current_user = auth_user.username
            self.parent_app.setup_user_session()
            
            messagebox.showinfo("Success", f"Welcome, {auth_user.full_name or auth_user.username}!\nLogged in via GitHub.")
            self.window.destroy()
            
        except Exception as e:
            messagebox.showerror("GitHub Login Failed", str(e))
            self.github_status.config(text="❌ Login failed", foreground='red')
        finally:
            # Clean up server
            if hasattr(self, 'oauth_server') and self.oauth_server:
                self.oauth_server.server_close()
    
    def exchange_code_for_token(self, auth_code):
        """Exchange authorization code for access token"""
        token_url = "https://github.com/login/oauth/access_token"
        
        data = {
            'client_id': self.github_config.client_id,
            'client_secret': self.github_config.client_secret,
            'code': auth_code,
            'redirect_uri': self.github_config.redirect_uri
        }
        
        headers = {'Accept': 'application/json'}
        
        response = requests.post(token_url, data=data, headers=headers, timeout=30)
        
        if response.status_code != 200:
            raise Exception(f"Token exchange failed: {response.text}")
        
        token_data = response.json()
        
        if 'error' in token_data:
            raise Exception(f"Token exchange error: {token_data['error_description']}")
        
        return token_data['access_token']
    
    def get_github_user_info(self, access_token):
        """Get user information from GitHub API"""
        headers = {
            'Authorization': f'token {access_token}',
            'Accept': 'application/vnd.github.v3+json'
        }
        
        # Get basic user info
        user_response = requests.get('https://api.github.com/user', headers=headers, timeout=30)
        if user_response.status_code != 200:
            raise Exception(f"Failed to get user info: {user_response.text}")
        
        user_data = user_response.json()
        
        # Get user emails
        email_response = requests.get('https://api.github.com/user/emails', headers=headers, timeout=30)
        emails = []
        if email_response.status_code == 200:
            emails = email_response.json()
        
        # Find primary email
        primary_email = ""
        for email in emails:
            if email.get('primary'):
                primary_email = email['email']
                break
        
        if not primary_email and emails:
            primary_email = emails[0]['email']
        
        return {
            'id': user_data['id'],
            'login': user_data['login'],
            'name': user_data.get('name', ''),
            'email': primary_email or user_data.get('email', ''),
            'avatar_url': user_data.get('avatar_url', '')
        }
    
    def create_or_update_github_user(self, github_user):
        """Create or update user account from GitHub data"""
        # Check if user already exists
        existing_user = None
        for user in self.parent_app.auth_users:
            if user.github_id == github_user['id']:
                existing_user = user
                break
        
        if existing_user:
            # Update existing user
            existing_user.full_name = github_user['name']
            existing_user.email = github_user['email']
            existing_user.avatar_url = github_user['avatar_url']
            auth_user = existing_user
        else:
            # Create new user
            auth_user = AuthUser(
                username=github_user['login'],
                github_id=github_user['id'],
                full_name=github_user['name'],
                email=github_user['email'],
                avatar_url=github_user['avatar_url'],
                auth_type="github"
            )
            self.parent_app.auth_users.append(auth_user)
        
        self.parent_app.save_auth_data()
        return auth_user
    
    def hash_password(self, password):
        """Hash password using SHA-256"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def local_login(self):
        """Local login with username/password"""
        username = self.login_username.get().strip()
        password = self.login_password.get().strip()
        
        if not username or not password:
            messagebox.showerror("Error", "Please enter both username and password")
            return
        
        password_hash = self.hash_password(password)
        
        # Check credentials
        for auth_user in self.parent_app.auth_users:
            if (auth_user.username == username and 
                auth_user.auth_type == "local" and 
                auth_user.password_hash == password_hash):
                
                self.current_user = username
                self.parent_app.current_user = username
                self.parent_app.setup_user_session()
                messagebox.showinfo("Success", f"Welcome back, {auth_user.full_name or username}!")
                self.window.destroy()
                return
        
        messagebox.showerror("Error", "Invalid username or password")
    
    def local_register(self):
        """Local registration"""
        username = self.reg_username.get().strip()
        password = self.reg_password.get().strip()
        confirm = self.reg_confirm.get().strip()
        fullname = self.reg_fullname.get().strip()
        email = self.reg_email.get().strip()
        
        if not username or not password:
            messagebox.showerror("Error", "Username and password are required")
            return
        
        if password != confirm:
            messagebox.showerror("Error", "Passwords do not match")
            return
        
        # Check if username exists
        if any(user.username == username for user in self.parent_app.auth_users):
            messagebox.showerror("Error", "Username already exists")
            return
        
        # Create new user
        password_hash = self.hash_password(password)
        new_auth_user = AuthUser(username, full_name=fullname, email=email, auth_type="local")
        new_auth_user.password_hash = password_hash
        
        self.parent_app.auth_users.append(new_auth_user)
        self.parent_app.save_auth_data()
        
        messagebox.showinfo("Success", "Account created successfully! You can now login.")
        
        # Switch to login tab and pre-fill username
        self.login_username.set(username)
        self.clear_register_form()
    
    def clear_register_form(self):
        """Clear registration form"""
        self.reg_username.set("")
        self.reg_password.set("")
        self.reg_confirm.set("")
        self.reg_fullname.set("")
        self.reg_email.set("")
    
    def on_close(self):
        """Handle window close"""
        # Clean up OAuth server if running
        if hasattr(self, 'oauth_server') and self.oauth_server:
            try:
                self.oauth_server.server_close()
            except:
                pass
        
        self.window.destroy()
        if not self.parent_app.current_user:
            self.parent_app.root.quit()

class UserInfoGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Team Collaboration Platform")
        self.root.geometry("900x750")
        
        # Authentication data
        self.auth_users = []
        self.current_user = None
        self.is_admin = False
        
        # Application data
        self.users = []
        self.projects = []
        
        # API Configuration
        self.api_key = ""
        self.api_url = "https://api.openai.com/v1/chat/completions"  # Default to OpenAI
        
        # File paths
        self.users_file = "users_data.json"
        self.projects_file = "projects_data.json"
        self.auth_file = "auth_users.json"
        
        self.load_auth_data()
        self.show_login()
    
    def show_login(self):
        """Show login window"""
        login_window = LoginWindow(self)
        self.root.wait_window(login_window.window)
        
        if not self.current_user:
            self.root.quit()
    
    def setup_user_session(self):
        """Setup UI based on user type"""
        # Determine if user is admin (first user or specific admin users)
        self.is_admin = len(self.auth_users) == 1 or self.current_user in ['admin', 'administrator']
        
        self.load_data()
        self.setup_ui()
        
        # Update title with current user
        auth_user = next((u for u in self.auth_users if u.username == self.current_user), None)
        user_display = auth_user.full_name if auth_user and auth_user.full_name else self.current_user
        auth_type = "GitHub" if auth_user and auth_user.auth_type == "github" else "Local"
        self.root.title(f"Team Collaboration Platform - {user_display} ({auth_type})")
    
    def setup_ui(self):
        # Create menu bar
        self.create_menu()
        
        # Create notebook for tabs
        notebook = ttk.Notebook(self.root)
        notebook.pack(expand=True, fill='both', padx=10, pady=10)
        
        # My Projects tab (always visible)
        self.my_projects_frame = ttk.Frame(notebook)
        notebook.add(self.my_projects_frame, text="My Projects")
        self.setup_my_projects_tab()
        
        # Chatbot tab (always visible)
        self.chatbot_frame = ttk.Frame(notebook)
        notebook.add(self.chatbot_frame, text="AI Assistant")
        self.setup_chatbot_tab()
        
        # Admin tabs (only for admins)
        if self.is_admin:
            self.users_frame = ttk.Frame(notebook)
            notebook.add(self.users_frame, text="Manage Users")
            self.setup_users_tab()
            
            self.projects_frame = ttk.Frame(notebook)
            notebook.add(self.projects_frame, text="Manage Projects")
            self.setup_projects_tab()
            
            self.prompt_frame = ttk.Frame(notebook)
            notebook.add(self.prompt_frame, text="AI Prompt Generator")
            self.setup_prompt_tab()
    
    def create_menu(self):
        """Create menu bar"""
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)
        
        # File menu
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="API Settings", command=self.show_api_settings)
        file_menu.add_separator()
        file_menu.add_command(label="Logout", command=self.logout)
        file_menu.add_command(label="Exit", command=self.root.quit)
        
        # Account menu
        account_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Account", menu=account_menu)
        account_menu.add_command(label="Profile", command=self.show_profile)
        
        # Help menu
        help_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Help", menu=help_menu)
        help_menu.add_command(label="GitHub OAuth Setup", command=self.show_github_setup_help)
        help_menu.add_command(label="About", command=self.show_about)
    
    def show_profile(self):
        """Show user profile"""
        auth_user = next((u for u in self.auth_users if u.username == self.current_user), None)
        if not auth_user:
            messagebox.showerror("Error", "User profile not found")
            return
        
        profile_window = tk.Toplevel(self.root)
        profile_window.title("User Profile")
        profile_window.geometry("400x350")
        profile_window.grab_set()
        
        main_frame = ttk.Frame(profile_window, padding="20")
        main_frame.pack(expand=True, fill='both')
        
        ttk.Label(main_frame, text="User Profile", font=('Arial', 16, 'bold')).pack(pady=(0, 20))
        
        # Profile info
        info_text = f"""Username: {auth_user.username}
Authentication: {auth_user.auth_type.title()}
Full Name: {auth_user.full_name or 'Not provided'}
Email: {auth_user.email or 'Not provided'}
Account Created: {auth_user.created_date}"""

        if auth_user.auth_type == "github":
            info_text += f"\nGitHub ID: {auth_user.github_id}"
        
        ttk.Label(main_frame, text=info_text, font=('Arial', 10)).pack(anchor='w')
        
        # Show avatar if available
        if auth_user.auth_type == "github" and auth_user.avatar_url:
            ttk.Label(main_frame, text=f"Avatar URL: {auth_user.avatar_url}", font=('Arial', 9)).pack(anchor='w', pady=(10, 0))
        
        ttk.Button(main_frame, text="Close", command=profile_window.destroy).pack(pady=20)
    
    def show_github_setup_help(self):
        """Show GitHub OAuth setup help"""
        help_window = tk.Toplevel(self.root)
        help_window.title("GitHub OAuth Setup Help")
        help_window.geometry("600x500")
        
        text_area = scrolledtext.ScrolledText(help_window, wrap=tk.WORD, padx=10, pady=10)
        text_area.pack(expand=True, fill='both')
        
        help_text = """GitHub OAuth Setup Guide

To enable GitHub authentication for your Team Collaboration Platform:

1. CREATE GITHUB OAUTH APP:
   • Go to https://github.com/settings/developers
   • Click "OAuth Apps" → "New OAuth App"
   • Fill in the application details:
     - Application name: Team Collaboration Platform
     - Homepage URL: http://localhost:8000
     - Application description: (optional)
     - Authorization callback URL: http://localhost:8000/callback

2. REGISTER THE APP:
   • Click "Register application"
   • GitHub will generate a Client ID and Client Secret

3. CONFIGURE IN APPLICATION:
   • In the login screen, click "⚙️ Configure GitHub OAuth"
   • Enter your Client ID and Client Secret
   • Save the configuration

4. TEST THE INTEGRATION:
   • Click "🐙 Sign in with GitHub" to test
   • It will open your browser for GitHub authentication
   • Authorize the application
   • You'll be redirected back and automatically logged in

SECURITY NOTES:
• Keep your Client Secret confidential
• The callback server runs locally on port 8000
• OAuth state parameter prevents CSRF attacks
• Access tokens are used only for authentication, not stored

TROUBLESHOOTING:
• Ensure port 8000 is not blocked by firewall
• Check that callback URL matches exactly
• Verify Client ID and Secret are correct
• Make sure you're using the correct GitHub account

Benefits of GitHub Authentication:
• No need to remember additional passwords
• Profile information automatically synced
• More secure than local passwords
• Professional development workflow integration
"""
        
        text_area.insert("1.0", help_text)
        text_area.config(state=tk.DISABLED)
    
    def setup_my_projects_tab(self):
        """Setup tab showing user's projects"""
        main_frame = ttk.Frame(self.my_projects_frame, padding="10")
        main_frame.pack(expand=True, fill='both')
        
        ttk.Label(main_frame, text="My Projects", font=('Arial', 14, 'bold')).pack(pady=(0, 10))
        
        # Projects listbox
        listbox_frame = ttk.Frame(main_frame)
        listbox_frame.pack(expand=True, fill='both')
        
        self.my_projects_listbox = tk.Listbox(listbox_frame, height=10)
        scrollbar = ttk.Scrollbar(listbox_frame, orient="vertical", command=self.my_projects_listbox.yview)
        self.my_projects_listbox.configure(yscrollcommand=scrollbar.set)
        
        self.my_projects_listbox.pack(side=tk.LEFT, expand=True, fill='both')
        scrollbar.pack(side=tk.RIGHT, fill='y')
        
        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(pady=10)
        
        ttk.Button(button_frame, text="Refresh", command=self.refresh_my_projects).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="View Details", command=self.view_project_details).pack(side=tk.LEFT, padx=5)
        
        self.refresh_my_projects()
    
    def setup_chatbot_tab(self):
        """Setup AI chatbot tab"""
        main_frame = ttk.Frame(self.chatbot_frame, padding="10")
        main_frame.pack(expand=True, fill='both')
        
        ttk.Label(main_frame, text="AI Assistant - Personal Task Manager", font=('Arial', 14, 'bold')).pack(pady=(0, 10))
        
        # Project selection for context
        context_frame = ttk.Frame(main_frame)
        context_frame.pack(fill='x', pady=(0, 10))
        
        ttk.Label(context_frame, text="Select Project for Context:").pack(side=tk.LEFT)
        self.chatbot_project_combo = ttk.Combobox(context_frame, state="readonly", width=40)
        self.chatbot_project_combo.pack(side=tk.LEFT, padx=10)
        
        ttk.Button(context_frame, text="Get My Tasks", command=self.get_user_tasks).pack(side=tk.LEFT, padx=5)
        
        # Chat display area
        self.chat_display = scrolledtext.ScrolledText(main_frame, wrap=tk.WORD, height=20, state=tk.DISABLED)
        self.chat_display.pack(expand=True, fill='both', pady=(0, 10))
        
        # Input frame
        input_frame = ttk.Frame(main_frame)
        input_frame.pack(fill='x')
        
        self.chat_input = tk.Text(input_frame, height=3, wrap=tk.WORD)
        self.chat_input.pack(side=tk.LEFT, expand=True, fill='x', padx=(0, 5))
        
        ttk.Button(input_frame, text="Send", command=self.send_message).pack(side=tk.RIGHT)
        
        # Bind Enter key
        self.chat_input.bind('<Control-Return>', lambda e: self.send_message())
        
        self.refresh_chatbot_projects()
        
        # Welcome message
        self.add_to_chat("System", "Welcome to your AI Assistant! Select a project and click 'Get My Tasks' for personalized assignments.")
    
    def setup_users_tab(self):
        """Admin-only users management tab"""
        main_frame = ttk.Frame(self.users_frame, padding="10")
        main_frame.pack(expand=True, fill='both')
        
        ttk.Label(main_frame, text="User Management (Admin)", font=('Arial', 14, 'bold')).pack(pady=(0, 10))
        
        # User form
        form_frame = ttk.LabelFrame(main_frame, text="Create User Profile", padding="10")
        form_frame.pack(fill='x', pady=(0, 20))
        
        # Link to existing auth user
        ttk.Label(form_frame, text="Link to Account:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.user_account_combo = ttk.Combobox(form_frame, state="readonly", width=30)
        self.user_account_combo.grid(row=0, column=1, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(form_frame, text="Display Name:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.name_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=self.name_var, width=50).grid(row=1, column=1, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(form_frame, text="Skills:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.skills_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=self.skills_var, width=50).grid(row=2, column=1, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(form_frame, text="Programming Languages:").grid(row=3, column=0, sticky=tk.W, pady=5)
        self.prog_lang_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=self.prog_lang_var, width=50).grid(row=3, column=1, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(form_frame, text="Willing to work on:").grid(row=4, column=0, sticky=(tk.W, tk.N), pady=5)
        self.willing_text = scrolledtext.ScrolledText(form_frame, width=50, height=4)
        self.willing_text.grid(row=4, column=1, sticky=(tk.W, tk.E), pady=5)
        
        form_frame.columnconfigure(1, weight=1)
        
        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(pady=10)
        
        ttk.Button(button_frame, text="Add User Profile", command=self.add_user).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Clear Form", command=self.clear_user_form).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Show All Users", command=self.show_users).pack(side=tk.LEFT, padx=5)
        
        # Status
        self.user_status_var = tk.StringVar()
        self.user_status_var.set("Ready to add user profiles")
        ttk.Label(main_frame, textvariable=self.user_status_var).pack(pady=5)
        
        self.refresh_account_combo()
    
    def setup_projects_tab(self):
        """Admin-only projects management tab"""
        main_frame = ttk.Frame(self.projects_frame, padding="10")
        main_frame.pack(expand=True, fill='both')
        
        ttk.Label(main_frame, text="Project Management (Admin)", font=('Arial', 14, 'bold')).pack(pady=(0, 10))
        
        # Project form
        form_frame = ttk.LabelFrame(main_frame, text="Create New Project", padding="10")
        form_frame.pack(fill='x', pady=(0, 20))
        
        ttk.Label(form_frame, text="Project Name:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.project_name_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=self.project_name_var, width=50).grid(row=0, column=1, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(form_frame, text="Description:").grid(row=1, column=0, sticky=(tk.W, tk.N), pady=5)
        self.project_desc_text = scrolledtext.ScrolledText(form_frame, width=50, height=4)
        self.project_desc_text.grid(row=1, column=1, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(form_frame, text="Goals:").grid(row=2, column=0, sticky=(tk.W, tk.N), pady=5)
        self.project_goals_text = scrolledtext.ScrolledText(form_frame, width=50, height=4)
        self.project_goals_text.grid(row=2, column=1, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(form_frame, text="Requirements:").grid(row=3, column=0, sticky=(tk.W, tk.N), pady=5)
        self.project_req_text = scrolledtext.ScrolledText(form_frame, width=50, height=4)
        self.project_req_text.grid(row=3, column=1, sticky=(tk.W, tk.E), pady=5)
        
        # User selection
        ttk.Label(form_frame, text="Select Team Members:").grid(row=4, column=0, sticky=(tk.W, tk.N), pady=5)
        
        user_select_frame = ttk.Frame(form_frame)
        user_select_frame.grid(row=4, column=1, sticky=(tk.W, tk.E), pady=5)
        
        self.users_listbox = tk.Listbox(user_select_frame, selectmode=tk.MULTIPLE, height=6)
        scrollbar2 = ttk.Scrollbar(user_select_frame, orient="vertical", command=self.users_listbox.yview)
        self.users_listbox.configure(yscrollcommand=scrollbar2.set)
        
        self.users_listbox.pack(side=tk.LEFT, fill='both', expand=True)
        scrollbar2.pack(side=tk.RIGHT, fill='y')
        
        form_frame.columnconfigure(1, weight=1)
        
        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(pady=10)
        
        ttk.Button(button_frame, text="Create Project", command=self.create_project).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Clear Form", command=self.clear_project_form).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Show All Projects", command=self.show_projects).pack(side=tk.LEFT, padx=5)
        
        # Status
        self.project_status_var = tk.StringVar()
        self.project_status_var.set("Ready to create projects")
        ttk.Label(main_frame, textvariable=self.project_status_var).pack(pady=5)
        
        self.refresh_users_list()
    
    def setup_prompt_tab(self):
        """Admin-only AI prompt generator tab"""
        main_frame = ttk.Frame(self.prompt_frame, padding="10")
        main_frame.pack(expand=True, fill='both')
        
        ttk.Label(main_frame, text="AI Prompt Generator (Admin)", font=('Arial', 14, 'bold')).pack(pady=(0, 10))
        
        # Project selection
        selection_frame = ttk.Frame(main_frame)
        selection_frame.pack(fill='x', pady=(0, 10))
        
        ttk.Label(selection_frame, text="Select Project:").pack(side=tk.LEFT)
        self.project_combo = ttk.Combobox(selection_frame, width=40, state="readonly")
        self.project_combo.pack(side=tk.LEFT, padx=10)
        
        ttk.Button(selection_frame, text="Generate Prompt", command=self.generate_ai_prompt).pack(side=tk.LEFT, padx=5)
        
        # Generated prompt display
        ttk.Label(main_frame, text="Generated AI Prompt:").pack(anchor='w', pady=(10, 5))
        self.prompt_text = scrolledtext.ScrolledText(main_frame, width=80, height=20, wrap=tk.WORD)
        self.prompt_text.pack(expand=True, fill='both', pady=5)
        
        # Action buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(pady=10)
        
        ttk.Button(button_frame, text="Copy to Clipboard", command=self.copy_prompt).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Save to File", command=self.save_prompt).pack(side=tk.LEFT, padx=5)
        
        self.refresh_projects_combo()
    
    # [Rest of the methods remain the same as in the previous version]
    # I'll continue with the key methods for the GitHub integration to work
    
    def show_api_settings(self):
        """Show API configuration window"""
        api_window = tk.Toplevel(self.root)
        api_window.title("API Settings")
        api_window.geometry("500x300")
        api_window.grab_set()
        
        main_frame = ttk.Frame(api_window, padding="20")
        main_frame.pack(expand=True, fill='both')
        
        ttk.Label(main_frame, text="API Configuration", font=('Arial', 14, 'bold')).pack(pady=(0, 20))
        
        # API URL
        ttk.Label(main_frame, text="API URL:").pack(anchor='w')
        api_url_var = tk.StringVar(value=self.api_url)
        ttk.Entry(main_frame, textvariable=api_url_var, width=60).pack(fill='x', pady=5)
        
        # API Key
        ttk.Label(main_frame, text="API Key:").pack(anchor='w', pady=(10, 0))
        api_key_var = tk.StringVar(value=self.api_key)
        ttk.Entry(main_frame, textvariable=api_key_var, show="*", width=60).pack(fill='x', pady=5)
        
        # Info
        info_text = "Configure your AI API settings here.\nFor OpenAI: Use https://api.openai.com/v1/chat/completions\nFor other APIs: Adjust URL accordingly"
        ttk.Label(main_frame, text=info_text, font=('Arial', 9), foreground='gray').pack(pady=20)
        
        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(pady=20)
        
        def save_settings():
            self.api_url = api_url_var.get()
            self.api_key = api_key_var.get()
            messagebox.showinfo("Success", "API settings saved!")
            api_window.destroy()
        
        ttk.Button(button_frame, text="Save", command=save_settings).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Cancel", command=api_window.destroy).pack(side=tk.LEFT, padx=5)
    
    def show_about(self):
        """Show about dialog"""
        messagebox.showinfo("About", 
            "Team Collaboration Platform v3.0\n"
            "With GitHub OAuth & AI-powered task management\n\n"
            "Features:\n"
            "• GitHub OAuth authentication\n"
            "• Local account fallback\n"
            "• Project management\n"
            "• Personal AI assistant\n"
            "• Personalized task assignment"
        )
    
    def logout(self):
        """Logout current user"""
        self.current_user = None
        self.is_admin = False
        for widget in self.root.winfo_children():
            widget.destroy()
        self.show_login()
    
    # Add all the remaining methods from the previous version
    # (refresh methods, CRUD operations, AI integration, etc.)
    
    def refresh_account_combo(self):
        """Refresh the account combo box for user linking"""
        if hasattr(self, 'user_account_combo'):
            usernames = [f"{user.username} ({user.auth_type})" for user in self.auth_users]
            self.user_account_combo['values'] = usernames
    
    def refresh_my_projects(self):
        """Refresh user's projects list"""
        if not hasattr(self, 'my_projects_listbox'):
            return
        
        self.my_projects_listbox.delete(0, tk.END)
        user_projects = [project for project in self.projects 
                        if any(user.username == self.current_user for user in project.selected_users)]
        
        for project in user_projects:
            self.my_projects_listbox.insert(tk.END, f"{project.name} - {project.description[:50]}...")
        
        if not user_projects:
            self.my_projects_listbox.insert(tk.END, "No projects assigned to you yet.")
    
    def refresh_chatbot_projects(self):
        """Refresh chatbot project selection"""
        if not hasattr(self, 'chatbot_project_combo'):
            return
        
        user_projects = [project for project in self.projects 
                        if any(user.username == self.current_user for user in project.selected_users)]
        
        project_names = [project.name for project in user_projects]
        self.chatbot_project_combo['values'] = project_names
        if project_names and not self.chatbot_project_combo.get():
            self.chatbot_project_combo.current(0)
    
    def view_project_details(self):
        """View selected project details"""
        if not hasattr(self, 'my_projects_listbox'):
            return
        
        selection = self.my_projects_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a project to view")
            return
        
        user_projects = [project for project in self.projects 
                        if any(user.username == self.current_user for user in project.selected_users)]
        
        if not user_projects:
            messagebox.showinfo("No Projects", "No projects assigned to you.")
            return
        
        if selection[0] < len(user_projects):
            project = user_projects[selection[0]]
            
            # Create details window
            details_window = tk.Toplevel(self.root)
            details_window.title(f"Project Details - {project.name}")
            details_window.geometry("600x500")
            
            text_area = scrolledtext.ScrolledText(details_window, wrap=tk.WORD)
            text_area.pack(expand=True, fill='both', padx=10, pady=10)
            
            details = f"""PROJECT: {project.name}
Created: {project.created_date}

DESCRIPTION:
{project.description}

GOALS:
{project.goals}

REQUIREMENTS:
{project.requirements}

TEAM MEMBERS:
"""
            for user in project.selected_users:
                auth_user = next((au for au in self.auth_users if au.username == user.username), None)
                auth_type = f" ({auth_user.auth_type})" if auth_user else ""
                details += f"• {user.name} ({user.username}){auth_type}\n"
            
            text_area.insert("1.0", details)
            text_area.config(state=tk.DISABLED)
    
    def get_user_tasks(self):
        """Get personalized tasks for current user"""
        selected_project_name = self.chatbot_project_combo.get()
        if not selected_project_name:
            messagebox.showwarning("No Project", "Please select a project first")
            return
        
        # Find the project
        project = next((p for p in self.projects if p.name == selected_project_name), None)
        if not project:
            messagebox.showerror("Error", "Project not found")
            return
        
        # Find current user in project
        current_user_profile = next((user for user in project.selected_users 
                                   if user.username == self.current_user), None)
        
        if not current_user_profile:
            messagebox.showerror("Error", "You are not a member of this project")
            return
        
        # Create personalized prompt
        prompt = self.create_user_specific_prompt(project, current_user_profile)
        
        # Send to AI API
        self.add_to_chat("System", f"Getting your personalized tasks for project: {project.name}")
        self.send_to_ai_api(prompt)
    
    def create_user_specific_prompt(self, project, user):
        """Create AI prompt specific to one user"""
        prompt = f"""PROJECT ANALYSIS FOR INDIVIDUAL TEAM MEMBER

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
        
        # Add all team members info for context
        for i, team_user in enumerate(project.selected_users, 1):
            prompt += f"""Team Member {i}:
Name: {team_user.name}
Skills: {team_user.skills}
Programming Languages: {team_user.programming_languages}
Willing to work on: {team_user.willing_to_work_on}
{">>> THIS IS THE REQUESTING USER <<<" if team_user.username == user.username else ""}

"""
        
        # Add specific instructions for individual user
        prompt += f"""=== INDIVIDUAL TASK ASSIGNMENT REQUEST ===

IMPORTANT: Focus ONLY on the user marked as ">>> THIS IS THE REQUESTING USER <<<" above.

User Details:
Name: {user.name}
Skills: {user.skills}
Programming Languages: {user.programming_languages}
Willing to work on: {user.willing_to_work_on}

Please analyze this project and provide a detailed response SPECIFICALLY for {user.name}:

1. IMMEDIATE TASKS (What to do RIGHT NOW):
   - List 3-5 specific, actionable tasks this user should start immediately
   - Base tasks on their skills and the project requirements
   - Include deadlines or urgency levels

2. FUTURE TASKS (What to prepare for):
   - Identify upcoming tasks this user will handle
   - Suggest preparation or learning needed
   - Timeline for these future responsibilities

3. SKILL UTILIZATION:
   - How their current skills best serve the project
   - Which of their programming languages to focus on
   - Areas where they can contribute most effectively

4. COLLABORATION GUIDANCE:
   - Which team members they should work closely with
   - How to coordinate with others on shared tasks
   - Communication protocols for this project

5. LEARNING OPPORTUNITIES:
   - Skills they might need to develop for this project
   - Resources or training they should pursue
   - How to bridge any skill gaps

Give me a specific message for THIS team member ({user.name}), detailing them what they need to do RIGHT NOW and in the FUTURE. Give each user the exact things they need to work on according also to their skills.

Format the response as a direct message to {user.name}, using "you" and "your" to address them personally."""

        return prompt
    
    def send_message(self):
        """Send user message to chatbot"""
        user_input = self.chat_input.get("1.0", tk.END).strip()
        if not user_input:
            return
        
        self.add_to_chat("You", user_input)
        self.chat_input.delete("1.0", tk.END)
        
        # Send to AI API
        self.send_to_ai_api(user_input)
    
    def add_to_chat(self, sender, message):
        """Add message to chat display"""
        self.chat_display.config(state=tk.NORMAL)
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        # Color coding for different senders
        if sender == "System":
            self.chat_display.insert(tk.END, f"[{timestamp}] {sender}: ", "system")
        elif sender == "AI Assistant":
            self.chat_display.insert(tk.END, f"[{timestamp}] {sender}: ", "ai")
        else:
            self.chat_display.insert(tk.END, f"[{timestamp}] {sender}: ", "user")
        
        self.chat_display.insert(tk.END, f"{message}\n\n")
        
        # Configure text tags for colors
        self.chat_display.tag_config("system", foreground="blue")
        self.chat_display.tag_config("ai", foreground="green")
        self.chat_display.tag_config("user", foreground="black")
        
        self.chat_display.config(state=tk.DISABLED)
        self.chat_display.see(tk.END)
    
    def send_to_ai_api(self, message):
        """Send message to AI API"""
        if not self.api_key:
            messagebox.showerror("API Error", "Please configure your API key in File > API Settings")
            return
        
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            data = {
                "model": "gpt-3.5-turbo",  # Default model
                "messages": [
                    {"role": "user", "content": message}
                ],
                "max_tokens": 1500,
                "temperature": 0.7
            }
            
            self.add_to_chat("System", "Sending request to AI...")
            
            # Use threading to prevent UI blocking
            def api_call():
                try:
                    response = requests.post(self.api_url, headers=headers, json=data, timeout=30)
                    
                    if response.status_code == 200:
                        result = response.json()
                        ai_response = result['choices'][0]['message']['content']
                        # Update UI in main thread
                        self.root.after(0, lambda: self.add_to_chat("AI Assistant", ai_response))
                    else:
                        error_msg = f"API Error {response.status_code}: {response.text}"
                        self.root.after(0, lambda: self.add_to_chat("System", error_msg))
                        
                except requests.exceptions.RequestException as e:
                    error_msg = f"Network Error: {str(e)}"
                    self.root.after(0, lambda: self.add_to_chat("System", error_msg))
                except Exception as e:
                    error_msg = f"Error: {str(e)}"
                    self.root.after(0, lambda: self.add_to_chat("System", error_msg))
            
            # Start API call in separate thread
            threading.Thread(target=api_call, daemon=True).start()
            
        except Exception as e:
            self.add_to_chat("System", f"Error setting up API call: {str(e)}")
    
    def add_user(self):
        """Add a new user profile (admin only)"""
        if not self.is_admin:
            messagebox.showerror("Access Denied", "Only admins can add user profiles")
            return
        
        account_selection = self.user_account_combo.get()
        if not account_selection:
            messagebox.showerror("Error", "Please select an account to link")
            return
        
        # Extract username from selection (format: "username (auth_type)")
        username = account_selection.split(" (")[0]
        
        name = self.name_var.get().strip()
        skills = self.skills_var.get().strip()
        programming_languages = self.prog_lang_var.get().strip()
        willing_to_work_on = self.willing_text.get("1.0", tk.END).strip()
        
        if not name or not skills or not programming_languages:
            messagebox.showerror("Error", "Please fill in all required fields")
            return
        
        # Check if user profile already exists for this username
        if any(user.username == username for user in self.users):
            messagebox.showerror("Error", "Profile already exists for this account")
            return
        
        new_user = User(name, skills, programming_languages, willing_to_work_on, username)
        self.users.append(new_user)
        
        self.user_status_var.set(f"User profile for '{name}' added successfully! Total profiles: {len(self.users)}")
        self.clear_user_form()
        self.refresh_users_list()
        self.save_data()
        messagebox.showinfo("Success", f"User profile for '{name}' has been added successfully!")
    
    def clear_user_form(self):
        """Clear user form"""
        self.user_account_combo.set("")
        self.name_var.set("")
        self.skills_var.set("")
        self.prog_lang_var.set("")
        self.willing_text.delete("1.0", tk.END)
    
    def show_users(self):
        """Show all user profiles"""
        if not self.users:
            messagebox.showinfo("No Users", "No user profiles have been added yet.")
            return
        
        users_window = tk.Toplevel(self.root)
        users_window.title("All User Profiles")
        users_window.geometry("700x600")
        
        text_area = scrolledtext.ScrolledText(users_window, wrap=tk.WORD)
        text_area.pack(expand=True, fill='both', padx=10, pady=10)
        
        for i, user in enumerate(self.users, 1):
            auth_user = next((au for au in self.auth_users if au.username == user.username), None)
            auth_info = f" ({auth_user.auth_type}, {auth_user.full_name})" if auth_user else " (No auth info)"
            
            text_area.insert(tk.END, f"=== User Profile {i} ===\n{user}\nAccount: {user.username}{auth_info}\n\n")
        
        text_area.config(state=tk.DISABLED)
    
    def create_project(self):
        """Create a new project (admin only)"""
        if not self.is_admin:
            messagebox.showerror("Access Denied", "Only admins can create projects")
            return
        
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
        self.refresh_my_projects()
        self.refresh_chatbot_projects()
        self.save_data()
        messagebox.showinfo("Success", f"Project '{name}' has been created successfully!")
    
    def clear_project_form(self):
        """Clear project form"""
        self.project_name_var.set("")
        self.project_desc_text.delete("1.0", tk.END)
        self.project_goals_text.delete("1.0", tk.END)
        self.project_req_text.delete("1.0", tk.END)
        if hasattr(self, 'users_listbox'):
            self.users_listbox.selection_clear(0, tk.END)
    
    def show_projects(self):
        """Show all projects"""
        if not self.projects:
            messagebox.showinfo("No Projects", "No projects have been created yet.")
            return
        
        projects_window = tk.Toplevel(self.root)
        projects_window.title("All Projects")
        projects_window.geometry("800x700")
        
        text_area = scrolledtext.ScrolledText(projects_window, wrap=tk.WORD)
        text_area.pack(expand=True, fill='both', padx=10, pady=10)
        
        for i, project in enumerate(self.projects, 1):
            text_area.insert(tk.END, f"=== Project {i} ===\n{project}\n\n")
        
        text_area.config(state=tk.DISABLED)
    
    def refresh_users_list(self):
        """Refresh the users listbox"""
        if hasattr(self, 'users_listbox'):
            self.users_listbox.delete(0, tk.END)
            for user in self.users:
                auth_user = next((au for au in self.auth_users if au.username == user.username), None)
                auth_type = f" ({auth_user.auth_type})" if auth_user else ""
                self.users_listbox.insert(tk.END, f"{user.name} ({user.username}){auth_type} - {user.skills}")
    
    def refresh_projects_combo(self):
        """Refresh the projects combobox"""
        if hasattr(self, 'project_combo'):
            project_names = [project.name for project in self.projects]
            self.project_combo['values'] = project_names
            if project_names and not self.project_combo.get():
                self.project_combo.current(0)
    
    def generate_ai_prompt(self):
        """Generate comprehensive AI prompt for selected project (admin only)"""
        if not self.is_admin:
            messagebox.showerror("Access Denied", "Only admins can generate prompts")
            return
        
        if not self.projects:
            messagebox.showwarning("No Projects", "No projects available. Create a project first.")
            return
        
        selected_project_name = self.project_combo.get()
        if not selected_project_name:
            messagebox.showwarning("No Selection", "Please select a project.")
            return
        
        selected_project = next((p for p in self.projects if p.name == selected_project_name), None)
        if not selected_project:
            messagebox.showerror("Error", "Selected project not found.")
            return
        
        prompt = self.create_comprehensive_prompt(selected_project)
        
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
        
        for i, user in enumerate(project.selected_users, 1):
            prompt += f"""Team Member {i}:
Name: {user.name}
Username: {user.username}
Skills: {user.skills}
Programming Languages: {user.programming_languages}
Willing to work on: {user.willing_to_work_on}

"""
        
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

Give me a specific message for EACH team member, detailing them what they need to do RIGHT NOW and in the FUTURE. Give each user the exact things they need to work on according also to their skills."""

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
    
    def save_auth_data(self):
        """Save authentication data"""
        try:
            with open(self.auth_file, 'w', encoding='utf-8') as f:
                json.dump([user.to_dict() for user in self.auth_users], f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving auth data: {e}")
    
    def load_auth_data(self):
        """Load authentication data"""
        try:
            if os.path.exists(self.auth_file):
                with open(self.auth_file, 'r', encoding='utf-8') as f:
                    auth_data = json.load(f)
                    self.auth_users = [AuthUser.from_dict(data) for data in auth_data]
        except Exception as e:
            print(f"Error loading auth data: {e}")
    
    def save_data(self):
        """Save users and projects to JSON files"""
        try:
            with open(self.users_file, 'w', encoding='utf-8') as f:
                json.dump([user.to_dict() for user in self.users], f, indent=2, ensure_ascii=False)
            
            with open(self.projects_file, 'w', encoding='utf-8') as f:
                json.dump([project.to_dict() for project in self.projects], f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving data: {e}")
    
    def load_data(self):
        """Load users and projects from JSON files"""
        try:
            if os.path.exists(self.users_file):
                with open(self.users_file, 'r', encoding='utf-8') as f:
                    users_data = json.load(f)
                    self.users = [User.from_dict(data) for data in users_data]
            
            if os.path.exists(self.projects_file):
                with open(self.projects_file, 'r', encoding='utf-8') as f:
                    projects_data = json.load(f)
                    for project_data in projects_data:
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
            
        except Exception as e:
            print(f"Error loading data: {e}")

def main():
    # Check if required packages are installed
    try:
        import requests
    except ImportError:
        print("Error: 'requests' package is required for GitHub OAuth and API integration.")
        print("Please install it using: pip install requests")
        return
    
    root = tk.Tk()
    app = UserInfoGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()