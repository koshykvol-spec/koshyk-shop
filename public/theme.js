// Перемикач теми (світла/темна), спільний для всіх сторінок сайту.
// Застосування теми відбувається миттєво інлайн-скриптом у <head> кожної
// сторінки (до першого рендеру, щоб не було "спалаху" неправильної теми) —
// цей файл лише навішує клік-обробник на кнопку-перемикач.
// Підключати після кнопки: <script src="/theme.js"></script>

(function () {
  function applyTheme(theme) {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var isLight = document.documentElement.getAttribute("data-theme") === "light";
      var next = isLight ? "dark" : "light";
      applyTheme(next);
      try { localStorage.setItem("koshykTheme", next); } catch (e) {}
    });
  });
})();
