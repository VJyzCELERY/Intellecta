// Main
const addCourseBtn = document.querySelector(".addCourse");
const courseForm = document.getElementById("courseForm");
const submitBtn = document.getElementById("submitCourse");
const cancelBtn = document.getElementById("cancelCourse");
const titleInput = document.getElementById("courseTitle");
const boxContainer = document.querySelector(".box-container");

// Show form on "Add Course"
addCourseBtn.addEventListener("click", () => {
    overlay.style.display = "flex";
    courseForm.style.display = "block";
    titleInput.focus();
});

// Hide form on "Cancel"
cancelBtn.addEventListener("click", () => {
    overlay.style.display = "none";
    courseForm.style.display = "none";
    titleInput.value = "";
});

// Handle "Submit"
submitBtn.addEventListener("click", () => {
    const title = titleInput.value.trim();
    if (title.length < 4) {
        alert("Course title must be at least 4 characters");
        return;
    }

    // Generate Course ID
    const courseId = title.slice(0, 4).toLowerCase() + Math.floor(100 + Math.random() * 900);

    // Create new course box
    const newBox = document.createElement("div");
    newBox.classList.add("box");
    newBox.innerHTML = `
      <div class="info">
        <h2 class="title">${title}</h2>
        <h3 class="description">${courseId}</h3>
      </div>
      <div class="course-button">
        <a href="material.html" class="inline-button">View Course</a>
        <button class="delete-button">
          <span class="material-symbols-outlined white-icon">
            delete
          </span>
        </button>
      </div>
    `;
    boxContainer.appendChild(newBox);

    // Reset and hide form
    overlay.style.display = "none";
    titleInput.value = "";
    courseForm.style.display = "none";
});

// Delegate delete button clicks using event delegation
boxContainer.addEventListener("click", function (e) {
    if (e.target.closest(".delete-button")) {
        const boxToDelete = e.target.closest(".box");
        if (boxToDelete) {
            boxToDelete.remove();
        }
    }
});


// search feature
const searchInput = document.querySelector(".search");

searchInput.addEventListener("input", function () {
    const query = this.value.trim().toLowerCase();
    const boxes = document.querySelectorAll(".box");

    boxes.forEach(box => {
        const title = box.querySelector(".title").textContent.toLowerCase();
        const id = box.querySelector(".description").textContent.toLowerCase();

        const matches = title.includes(query) || id.includes(query);
        box.style.display = matches ? "block" : "none";
    });
});

// Initial render
renderCourses();