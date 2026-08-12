(function(){
"use strict";
function refreshSafeLayout(){document.querySelectorAll(".bf-final-menu-pop.bf-show").forEach(x=>x.classList.remove("bf-show"));document.querySelectorAll(".bf-final-menu-btn.bf-open").forEach(x=>x.classList.remove("bf-open"));}
window.addEventListener("pageshow",refreshSafeLayout);
window.addEventListener("orientationchange",refreshSafeLayout);
window.addEventListener("resize",refreshSafeLayout);
})();
