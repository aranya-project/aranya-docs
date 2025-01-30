// Based on https://github.com/poole/lanyon under the MIT license.

(function (document) {
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

    let menuToggles = document.querySelectorAll(".toggle-sub-menu");
    menuToggles.forEach(function (elem) {
        elem.addEventListener(
            "click",
            function (e) {
                let parent = e.target.parentElement;
                if (parent.classList.contains("sub-menu")) {
                    parent.classList.toggle("open");
                }
                e.preventDefault();
            },
            false
        );
    });
})(document);
