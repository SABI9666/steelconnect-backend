// Your Render Backend URL
const RENDER_BACKEND_URL = 'https://steelconnect-backend.onrender.com';

// Global state for the application
const appState = {
    currentUser: null,
    jobs: [],
    quotes: [],
};

// --- CORE UI AND NAVIGATION FUNCTIONS ---

function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });
    const targetSection = document.getElementById(`${sectionId}-section`);
    if (targetSection) {
        targetSection.style.display = 'block';
    }
}

function showAlert(message, type = 'info') {
    const alertsContainer = document.getElementById('alerts');
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    alertsContainer.prepend(alertDiv);
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        setTimeout(() => alertDiv.remove(), 300);
    }, 5000);
}

function updateUIForLoggedInUser() {
    document.getElementById('user-profile').style.display = 'flex';
    document.querySelector('.auth-buttons').style.display = 'none';
    document.getElementById('hero-section').style.display = 'none';

    if (appState.currentUser) {
        const user = appState.currentUser;
        document.getElementById('userName').textContent = user.fullName || user.username;
        document.getElementById('userType').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
        const initials = (user.fullName || 'A').charAt(0).toUpperCase();
        document.getElementById('userAvatar').textContent = initials;
    }
    showSection('jobs');
}

function updateUIForLoggedOutUser() {
    document.getElementById('user-profile').style.display = 'none';
    document.querySelector('.auth-buttons').style.display = 'flex';
    document.getElementById('hero-section').style.display = 'block';
    showSection('jobs'); // Show public jobs list
}

// --- AUTHENTICATION HANDLERS ---

async function handleRegister(event) {
    event.preventDefault();
    const fullName = document.getElementById('regName').value;
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const role = document.getElementById('regType').value;

    const userData = { fullName, username, email, password, role };

    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });
        const data = await response.json();
        if (response.status === 201) {
            showAlert('Registration successful! Please sign in.', 'success');
            showSection('login');
        } else {
            showAlert(data.error || 'Registration failed.', 'error');
        }
    } catch (error) {
        showAlert('An error occurred during registration.', 'error');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('loginIdentifier').value; // Can be username or email
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('jwtToken', data.token);
            appState.currentUser = { ...data.user, token: data.token };
            updateUIForLoggedInUser();
            showAlert('Login successful!', 'success');
        } else {
            showAlert(data.error || 'Login failed.', 'error');
        }
    } catch (error) {
        showAlert('An error occurred during login.', 'error');
    }
}

function logout() {
    appState.currentUser = null;
    localStorage.removeItem('jwtToken');
    updateUIForLoggedOutUser();
    showAlert('Logged out successfully!', 'info');
}

async function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById('forgotPasswordEmail').value;
    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const data = await response.json();
        showAlert(data.message, 'info'); // Show the success/info message from the backend
    } catch (error) {
        showAlert('An error occurred. Please try again.', 'error');
    }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const newPassword = document.getElementById('resetPasswordNew').value;
    
    // Get the token from the URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
        showAlert('No reset token found. Please request a new link.', 'error');
        return;
    }

    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword }),
        });
        const data = await response.json();
        if (response.ok) {
            showAlert('Password reset successfully! You can now sign in.', 'success');
            // Clear the token from the URL and show the login page
            window.history.pushState({}, '', window.location.pathname);
            showSection('login');
        } else {
            showAlert(data.error || 'Password reset failed.', 'error');
        }
    } catch (error) {
        showAlert('An error occurred. Please try again.', 'error');
    }
}

// --- INITIALIZATION ---

function initializeApp() {
    // Add event listeners to all forms
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('forgot-password-form').addEventListener('submit', handleForgotPassword);
    document.getElementById('reset-password-form').addEventListener('submit', handleResetPassword);

    // Check for a password reset token in the URL on page load
    const params = new URLSearchParams(window.location.search);
    if (params.has('token')) {
        showSection('reset-password');
    } else {
        // Default view
        showSection('jobs');
    }

    // Check for existing JWT token
    const token = localStorage.getItem('jwtToken');
    if (token) {
        // In a real app, you'd verify the token with a `/profile` endpoint
        // For now, we'll just update the UI
        appState.currentUser = { token: token }; // Minimal user object
        updateUIForLoggedInUser();
    } else {
        updateUIForLoggedOutUser();
    }
}

// Wait for the DOM to be fully loaded before running the app
document.addEventListener('DOMContentLoaded', initializeApp);