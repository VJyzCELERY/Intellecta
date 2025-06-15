/**
 * Toggles visibility between the login and register forms by
 * adding or removing the 'active' class from both form containers.
 */
function toggleForms() {
    document.getElementById('loginForm').classList.toggle('active');
    document.getElementById('registerForm').classList.toggle('active');
}

/**
 * Validates if the provided email string matches a basic email pattern.
 * 
 * @param {string} email - The email address to validate.
 * @returns {boolean} - Returns true if the email format is valid.
 */
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Validates password strength based on three rules:
 * - At least one digit
 * - At least one special character
 * - Minimum length of 6 characters
 * 
 * @param {string} password - The password to validate.
 * @returns {boolean} - Returns true if the password is strong enough.
 */
function validatePassword(password) {
    return /(?=.*\d)(?=.*[!@#$%^&*])(?=.{6,})/.test(password);
}

/**
 * Handles login form validation and submission.
 * - Checks if all fields are filled
 * - Calls `window.userAPI.login()` for backend authentication
 * - On success: sets user data and redirects to home page
 * - On failure: shows an error message
 */
async function validateLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const error = document.getElementById('loginError');

    if (!username || !password) {
        error.textContent = 'Please input all the field.';
    } else {
        const success = await window.userAPI.login(username,password);
        if(success){
            await window.userAPI.setUser({id:username,name:username})
            window.location.href = "./home.html";
        }else{
            error.textContent='Invalid username or password';
        }
    }
}

/**
 * Handles register form validation and submission.
 * - Validates email, username, contact, and password format
 * - Calls `window.userAPI.register()` for backend registration
 * - Displays validation or backend error messages
 * - On success: switches to login form
 */
async function validateRegister() {
    const email = document.getElementById('registerEmail').value.trim();
    const username = document.getElementById('registerUsername').value.trim();
    const contact = document.getElementById('registerContact').value.trim();
    const password = document.getElementById('registerPassword').value.trim();
    const error = document.getElementById('registerError');

    if (!validateEmail(email)) {
        error.textContent = 'Invalid email format.';
    } else if (username.length < 3) {
        error.textContent = 'Username must be at least 3 characters.';
    } else if (!/^\d{10,15}$/.test(contact)) {
        error.textContent = 'Contact number must be 10–15 digits.';
    } else if (!validatePassword(password)) {
        error.textContent = 'Password must be at least 6 characters, with a number and a symbol.';
    } else {
        error.textContent = await window.userAPI.register(email, username, contact, password);
        toggleForms();
    }
}

/**
 * Placeholder function to simulate social login.
 * Currently only displays an alert for the selected provider.
 * 
 * @param {string} provider - The social login provider (e.g., 'Google', 'Facebook').
 */
function socialLogin(provider) {
    alert(provider + ' login clicked (example).');
}

/**
 * Toggles the visibility of a password input field.
 * Switches between 'password' and 'text' input types.
 * 
 * @param {string} id - The DOM ID of the password input field.
 */
function togglePassword(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
} 