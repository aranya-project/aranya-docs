/*
* Released under MIT License
*
* Copyright (c) 2014 Mark Otto.
*
* Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction,including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

(function (document) {
  var toggle = document.querySelector(".sidebar-toggle");
  var sidebar = document.querySelector("#sidebar");
  var checkbox = document.querySelector("#sidebar-checkbox");

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
})(document);
