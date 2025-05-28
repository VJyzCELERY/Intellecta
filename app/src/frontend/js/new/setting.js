// setting
// Navigation handling for SETTINGS PANEL
document.querySelectorAll('.nav-li').forEach(item => { // Changed to .nav-li
    item.addEventListener('click', function () {
        if (this.dataset.section === 'logout') {
            confirmLogout();
            return;
        }

        // Remove active class from all settings nav items
        document.querySelectorAll('.nav-li').forEach(nav => nav.classList.remove('active'));
        this.classList.add('active');

        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.add('hidden');
        });

        // Show selected section
        document.getElementById(this.dataset.section).classList.remove('hidden');
    });
});

// Logout Modal Functions
function confirmLogout() {
    document.getElementById('logoutOverlay').classList.remove('hidden');
    document.getElementById('logoutModal').classList.remove('hidden');
}

function closeLogoutModal() {
    document.getElementById('logoutOverlay').classList.add('hidden');
    document.getElementById('logoutModal').classList.add('hidden');
}

function handleConfirmLogout() {
    // Perform actual logout here
    window.location.href = '../login/login.html';
}

// Modal event listeners
document.getElementById('logoutOverlay').addEventListener('click', closeLogoutModal);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLogoutModal();
});

// Avatar upload preview
document.getElementById('avatarInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            document.querySelector('.avatar-preview').src = event.target.result;
        }
        reader.readAsDataURL(file);
    }
});

// Mobile sidebar toggle
const mobileToggle = document.querySelector('.mobile-nav-toggle');
const navSidebar = document.querySelector('.nav-sidebar');

function toggleMobileNav() {
    navSidebar.classList.toggle('active');
    mobileToggle.classList.toggle('active');
}

document.querySelectorAll('.nav-li').forEach(item => {
  item.addEventListener('click', function() {
    if (window.innerWidth <= 768) {
      navSidebar.classList.remove('active');
      mobileToggle.classList.remove('active');
    }
  });
});

// Update your existing handleResponsive function
function handleResponsive() {
  if (window.innerWidth <= 768) {
    mobileToggle.classList.remove('hidden');
    navSidebar.classList.remove('active');
  } else {
    mobileToggle.classList.add('hidden');
    navSidebar.classList.add('active');
  }
}

// Event listeners
mobileToggle.addEventListener('click', toggleMobileNav);
window.addEventListener('resize', handleResponsive);

// Initial check
handleResponsive();