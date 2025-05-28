function toggleForms() {
    document.getElementById('loginForm').classList.toggle('active');
    document.getElementById('registerForm').classList.toggle('active');
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    return /(?=.*\d)(?=.*[!@#$%^&*])(?=.{6,})/.test(password);
}

function validateLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const error = document.getElementById('loginError');

    if (!email || !password) {
        error.textContent = 'All fields are required.';
    } else {
        error.textContent = '';
        window.location.href = "../home/home.html"; // Redirect to home page on successful login
    }
}

function validateRegister() {
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
        error.textContent = '';
        alert('Registration successful (example).');
    }
}

function socialLogin(provider) {
    alert(provider + ' login clicked (example).');
}

function togglePassword(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
} 