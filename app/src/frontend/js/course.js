// Main
const addCourseBtn = document.querySelector(".addCourse");
const courseForm = document.getElementById("courseForm");
const submitBtn = document.getElementById("submitCourse");
const cancelBtn = document.getElementById("cancelCourse");
const titleInput = document.getElementById("courseTitle");
const descInput = document.getElementById("courseDesc");
const boxContainer = document.querySelector(".box-container");
const userId='testuser';

document.addEventListener('DOMContentLoaded', () => {
    loadCourses()
});
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

function openCourse(courseId) {
  window.location.href = `material.html?id=${courseId}`;
}

function removeCourse(courseId){
  window.courseAPI.deleteCourse(courseId);
  try{
    window.chatAPI.deleteSession(userId,courseId);

  }catch(error){
    console.log(error);
  }
}

function loadCourses() {
  window.courseAPI.getCourses().then(courses => {
    boxContainer.innerHTML = '';

    courses.forEach(course => {
      createCourseBox(course.title, course.id,course.description);
    });
  });
}

function createCourseBox(title,id,description){
  const newBox = document.createElement("div");
  newBox.classList.add("box");
  newBox.innerHTML = `
      <div class="info">
        <h2 class="title">${title}</h2>
        <h3 class="description">${description}</h3>
      </div>
      <div class="course-button">
        <a onclick="openCourse('${id}')" class="inline-button">View Course</a>
        <button class="delete-button" onclick="removeCourse('${id}')">
          <span class="material-symbols-outlined white-icon">
            delete
          </span>
        </button>
      </div>
  `;
  boxContainer.appendChild(newBox);
}

// Handle "Submit"
submitBtn.addEventListener("click", () => {
    const title = titleInput.value.trim();
    const description = descInput.value.trim(); 
    if (title.length < 4) {
        alert("Course title must be at least 4 characters");
        return;
    }
    if (description.length < 1){
      alert("Please fill in the description");
      return;
    }
    // Create new course box
    window.courseAPI.createCourse({title,description});
    loadCourses();
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