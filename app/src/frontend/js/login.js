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
            alert('Login failed');
        }
    }
}

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
        error.textContent = '';
        alert(await window.userAPI.register(email, username, contact, password));
        toggleForms();
    }
}

function socialLogin(provider) {
    alert(provider + ' login clicked (example).');
}

function togglePassword(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
} 