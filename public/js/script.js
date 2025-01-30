// Based on https://github.com/poole/lanyon under the MIT license.

let toggle = document.querySelector(".sidebar-toggle");
let sidebar = document.querySelector("#sidebar");
let checkbox = document.querySelector("#sidebar-checkbox");
document.addEventListener(
    "click",
    function (e) {
        var target = e.target;
        if (sidebar.contains(target) || target === checkbox) {
            // Do nothing is clicking in the sidebar.
            return;
        } else if (target === toggle) {
            // Toggle menu when menu toggle clicked.
            checkbox.checked = !checkbox.checked;
        } else if (checkbox.checked) {
            // Close the menu if the document body is clicked.
            checkbox.checked = false;
        }
    },
    false
);

function toggleSubMenu(e) {
    e.preventDefault();
    let parent = e.target.parentElement;
    if (parent.classList.contains("sub-menu")) {
        parent.classList.toggle("open");
    }
}
